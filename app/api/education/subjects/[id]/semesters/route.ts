import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api/handler'
import { apiError, apiErrorWith } from '@/lib/i18n/api-errors'
import { isMissingColumn, isMissingRelation } from '@/lib/supabase/errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { createSubjectSemesters, nextMissingTerm, pickSemesterPrice } from '@/lib/education/subject-semesters'

/**
 * POST /api/education/subjects/[id]/semesters
 * Добавляет ОДИН недостающий семестр существующему предмету: наименьший номер
 * (1, 2, 3 …), ещё не занятый семестрами (is_semester) этого предмета.
 *
 * Body (всё опционально):
 *   tuition_amount — цена; по умолчанию цена существующего семестра предмета,
 *                    иначе DEFAULT_SEMESTER_PRICE;
 *   force          — true: создать, даже если найден семестр с тем же
 *                    маршрутом + годом + номером (+ предметом).
 * Право: manage_subjects в подразделении маршрута предмета (как POST /subjects).
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const body = await request.json().catch(() => ({})) as {
      tuition_amount?: number
      force?: boolean
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

    // Маршрут → подразделение (права + NOT NULL department_id у class_groups).
    const { data: track, error: trackErr } = await sb
      .from('study_tracks')
      .select('id, department_id')
      .eq('id', subject.study_track_id)
      .maybeSingle()
    if (trackErr || !track) return apiError('study_track_required', 400)
    const trackDeptId = (track as { department_id: string | null }).department_id

    await requireEducationPrivilege('manage_subjects', { department_id: trackDeptId ?? undefined })

    if (!trackDeptId) return apiError('track_no_department', 400)

    // Существующие семестры предмета — для выбора номера и цены по умолчанию.
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

    const term = nextMissingTerm(rows.map(r => r.term_number))
    const price = pickSemesterPrice(body.tuition_amount, rows)

    const res = await createSubjectSemesters(sb, {
      subjectId: params.id,
      baseName: subject.name_he || subject.name,
      departmentId: trackDeptId,
      studyTrackId: subject.study_track_id,
      yearLevel: subject.year_level ?? null,
      terms: [term],
      price,
      checkDuplicate: true,
      force: body.force === true,
    })

    if (res.duplicate) {
      return apiErrorWith('semester_exists', 409, { name: res.duplicate.name })
    }
    const created = res.created[0]
    if (!created) return apiError('db_error', 500)

    return NextResponse.json({ id: created.id, term_number: created.term_number, tuition_amount: price }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    return errorResponse(e)
  }
}
