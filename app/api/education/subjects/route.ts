import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api/handler'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { isMissingRelation } from '@/lib/supabase/errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege, hasEducationPrivilege, getEducationStructureDeptFilter } from '@/lib/education/permissions'
import type { SubjectInsert } from '@/types/database'
import { ensureSubjectInTrackSemesters, DEFAULT_SEMESTER_PRICE, isSubjectNameTaken } from '@/lib/education/subject-semesters'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'


function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '23505') return { status: 409, message: serverT('subject_exists') }
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference_department_id') }
  return { status: 500, message: error.message ?? serverT('db_error') }
}

/**
 * GET /api/education/subjects
 * Query: department_id (опц.), active_only (опц., default true)
 * Доступен любому авторизованному — используется в дропдаунах других модулей.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth()
    const params = request.nextUrl.searchParams
    const departmentId = params.get('department_id')
    const activeOnly = params.get('active_only') !== 'false'

    // Видимость по подразделению: СТРУКТУРНЫЙ фильтр — по управлению (manage_*),
    // а не по view_students. Иначе «אחראית יהדות» (view_students='all' для списка
    // студенток) видела бы все предметы חול. scope='all' — все; 'department' —
    // только предметы своих подразделений (кодеш). Не-education вызовы (дропдаун
    // в других модулях) → null → прежнее поведение (все).
    const myDepts = await getEducationStructureDeptFilter(session)
    if (myDepts && myDepts.length === 0) return NextResponse.json({ subjects: [] })

    const sb = createServerClient()
    let qb = sb
      .from('subjects')
      .select('*, department:departments(id, name), track:study_tracks(id, code, name_he, name_ru, name_en)')
      .order('sort_order')
      .order('name')

    if (departmentId) qb = qb.eq('department_id', departmentId)
    if (myDepts) qb = qb.in('department_id', myDepts)
    if (activeOnly) qb = qb.eq('is_active', true)

    const { data, error } = await qb
    if (error) throw error

    return NextResponse.json({ subjects: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return errorResponse(m)
    }
    return errorResponse(e)
  }
}

/**
 * POST /api/education/subjects
 * Модель: מקצוע висит на МАРШРУТЕ (study_track) + ГОДЕ (year_level).
 * department выводится из маршрута (для прав/видимости). При создании предмет
 * добавляется КУРСОМ в семестр 1 и семестр 2 маршрута + года (решение владельца
 * 2026-09-24: один семестр — несколько предметов). Нет такого семестра — он
 * создаётся один раз с ценой tuition_amount; цена существующего семестра не
 * меняется.
 * Право: manage_subjects в подразделении маршрута; для добавления в семестры —
 * то же право, что у POST /semester-groups/[id]/courses (кодеш —
 * create_kodesh_course, иначе manage_class_groups). Без него предмет создаётся,
 * но в семестры не добавляется (warning).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      name?: string
      name_he?: string
      name_ru?: string
      name_en?: string
      study_track_id?: string
      year_level?: number
      tuition_amount?: number
      sort_order?: number
      force?: boolean
    }

    const nameHe = body.name_he?.trim() || null
    const nameRu = body.name_ru?.trim() || null
    const nameEn = body.name_en?.trim() || null
    // `name` — каноническая (NOT NULL) колонка. Берём русское имя, иначе иврит,
    // иначе присланное legacy `name`.
    const name = nameRu || nameHe || body.name?.trim()
    if (!name) return apiError('title_required', 400)
    if (!body.study_track_id) return apiError('study_track_required', 400)
    if (!body.year_level || body.year_level < 1) return apiError('year_level_required', 400)

    const sb = createServerClient()

    // Маршрут → ответственное подразделение (для прав и видимости).
    const { data: track, error: trackErr } = await sb
      .from('study_tracks')
      .select('id, department_id, code, name_he, name_ru, name_en')
      .eq('id', body.study_track_id)
      .single()
    if (trackErr || !track) return apiError('study_track_required', 400)
    const trackRow = track as {
      id: string; department_id: string | null
      code: string | null; name_he: string | null; name_ru: string | null; name_en: string | null
    }
    const trackDeptId = trackRow.department_id

    const session = await requireEducationPrivilege('manage_subjects', { department_id: trackDeptId ?? undefined })

    // Предупреждение о дубликате: предмет с тем же именем (name_he или name) уже
    // есть на том же маршруте + году. force === true — создать всё равно.
    if (body.force !== true) {
      const { data: sameSlot, error: dupErr } = await sb
        .from('subjects')
        .select('id, name, name_he')
        .eq('study_track_id', body.study_track_id)
        .eq('year_level', body.year_level)
      // Ошибка чтения (нет колонки и т.п.) — проверку пропускаем, создание не ломаем.
      if (!dupErr && isSubjectNameTaken(sameSlot ?? [], [nameHe, name])) {
        return apiError('subject_exists', 409)
      }
    }

    const insert: SubjectInsert = {
      name,
      name_he: nameHe,
      name_ru: nameRu,
      name_en: nameEn,
      department_id: trackDeptId ?? null,
      study_track_id: body.study_track_id,
      year_level: body.year_level,
      sort_order: body.sort_order ?? 0,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('subjects')
      .insert(insert as any)
      .select('*, department:departments(id, name), track:study_tracks(id, code, name_he, name_ru, name_en)')
      .single()

    if (error) {
      if (isMissingRelation(error)) return apiError('feature_not_migrated', 503)
      const m = mapDbError(error)
      return errorResponse(m)
    }

    // Добавление предмета курсом в семестр 1 и 2 маршрута + года (общий хелпер
    // ensureSubjectInTrackSemesters). Требует department (NOT NULL на
    // class_groups): если у маршрута нет подразделения — пропускаем с warning,
    // предмет всё равно создан.
    const subjectRow = data as { id: string; name: string; name_he: string | null }
    let warning: string | undefined
    // tuition_amount из формы — цена ТОЛЬКО для вновь создаваемого семестра.
    const price = typeof body.tuition_amount === 'number' && body.tuition_amount >= 0
      ? body.tuition_amount
      : DEFAULT_SEMESTER_PRICE

    if (!trackDeptId) {
      warning = serverT('subject_no_track_department')
    } else {
      // Право на создание курса — как в POST /semester-groups/[id]/courses.
      const coursePriv = trackDeptId === KODESH_DEPT_ID ? 'create_kodesh_course' : 'manage_class_groups'
      const canAddCourses = await hasEducationPrivilege(session, coursePriv, { department_id: trackDeptId })
      if (!canAddCourses) {
        warning = serverT('subject_courses_no_privilege')
      } else {
        const res = await ensureSubjectInTrackSemesters(sb, {
          subject: { id: subjectRow.id, name: subjectRow.name, name_he: subjectRow.name_he },
          track: trackRow,
          yearLevel: body.year_level,
          price,
        })
        if (res.notMigrated || res.failed > 0) warning = serverT('subject_semesters_partial')
      }
    }

    return NextResponse.json(warning ? { ...data, warning } : data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return errorResponse(m)
    }
    return errorResponse(e)
  }
}
