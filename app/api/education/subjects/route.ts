import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import type { SubjectInsert } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

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
    await requireAuth()
    const params = request.nextUrl.searchParams
    const departmentId = params.get('department_id')
    const activeOnly = params.get('active_only') !== 'false'

    const sb = createServerClient()
    let qb = sb
      .from('subjects')
      .select('*, department:departments(id, name), track:study_tracks(id, code, name_he, name_ru, name_en)')
      .order('sort_order')
      .order('name')

    if (departmentId) qb = qb.eq('department_id', departmentId)
    if (activeOnly) qb = qb.eq('is_active', true)

    const { data, error } = await qb
    if (error) throw error

    return NextResponse.json({ subjects: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/** מחיר ברירת המחדל לסמסטר (₽) — ניתן לשינוי בעת היצירה ואחריה. */
const DEFAULT_SEMESTER_PRICE = 210000

/**
 * POST /api/education/subjects
 * Модель: מקצוע висит на МАРШРУТЕ (study_track) + ГОДЕ (year_level).
 * department выводится из маршрута (для прав/видимости). При создании
 * автоматически заводятся 2 семестра (class_groups, term_number 1/2) с ценой.
 * Право: manage_subjects в подразделении маршрута.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      name?: string
      name_he?: string
      study_track_id?: string
      year_level?: number
      tuition_amount?: number
      sort_order?: number
    }

    const name = body.name?.trim()
    if (!name) return apiError('title_required', 400)
    if (!body.study_track_id) return apiError('study_track_required', 400)
    if (!body.year_level || body.year_level < 1) return apiError('year_level_required', 400)

    const sb = createServerClient()

    // Маршрут → ответственное подразделение (для прав и видимости).
    const { data: track, error: trackErr } = await sb
      .from('study_tracks')
      .select('id, department_id')
      .eq('id', body.study_track_id)
      .single()
    if (trackErr || !track) return apiError('study_track_required', 400)
    const trackDeptId = (track as { department_id: string | null }).department_id

    await requireEducationPrivilege('manage_subjects', { department_id: trackDeptId ?? undefined })

    const insert: SubjectInsert = {
      name,
      name_he: body.name_he?.trim() || null,
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
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    // Автосоздание 2 семестров под предмет. Требует department (NOT NULL на
    // class_groups). Если у маршрута нет подразделения — пропускаем с warning,
    // предмет всё равно создан.
    const subjectId = (data as { id: string }).id
    let warning: string | undefined
    const price = typeof body.tuition_amount === 'number' && body.tuition_amount >= 0
      ? body.tuition_amount
      : DEFAULT_SEMESTER_PRICE

    if (trackDeptId) {
      for (const term of [1, 2]) {
        const semInsert: Record<string, unknown> = {
          name: `${name} · ${term}`,
          department_id: trackDeptId,
          subject_id: subjectId,
          study_track_id: body.study_track_id,
          year_level: body.year_level,
          is_semester: true,
          sem_status: 'open',
          term_number: term,
          tuition_amount: price,
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: semErr } = await sb.from('class_groups').insert(semInsert as any)
        if (semErr) warning = serverT('subject_semesters_partial')
      }
    } else {
      warning = serverT('subject_no_track_department')
    }

    return NextResponse.json(warning ? { ...data, warning } : data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
