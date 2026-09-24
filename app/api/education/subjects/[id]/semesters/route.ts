import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'
import { isMissingColumn, isMissingRelation } from '@/lib/supabase/errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { ensureSubjectInTrackSemesters, pickSemesterPrice } from '@/lib/education/subject-semesters'

/**
 * POST /api/education/subjects/[id]/semesters
 * «הוסף לסמסטרים»: добавляет предмет КУРСОМ в семестр 1 и семестр 2 его
 * маршрута + года (решение владельца 2026-09-24: один семестр — несколько
 * предметов). Если семестра для номера ещё нет — он создаётся один раз.
 * Где курс предмета уже есть — пропускается. Старые семестры «по предмету»
 * (subject_id задан) не трогаются.
 *
 * Body (опционально):
 *   tuition_amount — цена ТОЛЬКО для вновь создаваемого семестра; по умолчанию
 *                    цена существующего семестра «по предмету», иначе
 *                    DEFAULT_SEMESTER_PRICE. Цена существующего семестра не меняется.
 * Ответ: 201 { semesters, courses_added }; 409 subject_already_in_semesters —
 * предмет уже есть в обоих семестрах.
 * Право: manage_subjects в подразделении маршрута предмета (как POST /subjects)
 * И право создания курса, как в POST /semester-groups/[id]/courses (кодеш —
 * create_kodesh_course, иначе manage_class_groups).
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const body = await request.json().catch(() => ({})) as {
      tuition_amount?: number
    }

    const sb = createServerClient()

    const { data: subject, error: subjErr } = await sb
      .from('subjects')
      .select('id, name, name_he, study_track_id, year_level')
      .eq('id', params.id)
      .maybeSingle()
    if (subjErr) {
      if (isMissingRelation(subjErr)) return apiError('feature_not_migrated', 503)
      throw subjErr
    }
    if (!subject) return apiError('subject_not_found', 404)
    if (!subject.study_track_id) return apiError('study_track_required', 400)
    // Семестры-контейнеры определяются маршрутом + годом: без года — не к чему добавлять.
    if (subject.year_level == null) return apiError('year_level_required', 400)

    // Маршрут → подразделение (права + NOT NULL department_id у class_groups).
    const { data: track, error: trackErr } = await sb
      .from('study_tracks')
      .select('id, department_id, code, name_he, name_ru, name_en')
      .eq('id', subject.study_track_id)
      .maybeSingle()
    if (trackErr || !track) return apiError('study_track_required', 400)
    const trackRow = track as {
      id: string; department_id: string | null
      code: string | null; name_he: string | null; name_ru: string | null; name_en: string | null
    }
    const trackDeptId = trackRow.department_id

    await requireEducationPrivilege('manage_subjects', { department_id: trackDeptId ?? undefined })

    if (!trackDeptId) return apiError('track_no_department', 400)

    // Право на создание курса — как в POST /semester-groups/[id]/courses.
    await requireEducationPrivilege(
      trackDeptId === KODESH_DEPT_ID ? 'create_kodesh_course' : 'manage_class_groups',
      { department_id: trackDeptId },
    )

    // Цена по умолчанию для НОВОГО семестра — как у старых семестров «по предмету».
    const { data: existing, error: exErr } = await sb
      .from('class_groups')
      .select('term_number, tuition_amount')
      .eq('subject_id', params.id)
      .eq('is_semester', true)
    if (exErr) {
      if (isMissingColumn(exErr) || isMissingRelation(exErr)) return apiError('feature_not_migrated', 503)
      throw exErr
    }
    const rows = (existing ?? []) as Array<{ term_number: number | null; tuition_amount: number | null }>
    const price = pickSemesterPrice(body.tuition_amount, rows)

    const res = await ensureSubjectInTrackSemesters(sb, {
      subject: { id: subject.id, name: subject.name, name_he: subject.name_he },
      track: trackRow,
      yearLevel: subject.year_level,
      price,
    }, [1, 2])

    if (res.notMigrated) return apiError('feature_not_migrated', 503)
    const createdSemesters = res.semesters.filter(s => s.created).length
    if (createdSemesters === 0 && res.coursesAdded.length === 0) {
      if (res.failed > 0) return apiError('db_error', 500)
      return apiError('subject_already_in_semesters', 409)
    }

    return NextResponse.json({
      semesters: res.semesters,
      courses_added: res.coursesAdded,
      ...(res.failed > 0 ? { failed: res.failed } : {}),
    }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    return errorResponse(e)
  }
}
