import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getClassGroupTarget, getEnrolledJourneyIds } from '@/lib/education/lesson-access'
import { isCourseResultStatus, isValidFinalGrade } from '@/lib/education/courses'
import { isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * מצב בקורס учебной группы.
 *
 * GET /api/education/class-groups/[id]/results — статусы всех учениц группы
 *   (нет строки = in_progress). Право: view_students в контексте группы.
 * PUT /api/education/class-groups/[id]/results — поставить статус одной ученице.
 *   Body: { journey_id, status, final_grade?: number|null, note?: string|null }.
 *   Право: set_grades в контексте группы; ученица должна быть записана в группу.
 */

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const sb = createServerClient()
    const target = await getClassGroupTarget(sb, params.id)
    if (!target) return apiError('group_not_found', 404)
    await requireEducationPrivilege('view_students', target)

    const { data, error } = await sb
      .from('course_results')
      .select('journey_id, status, final_grade, note, updated_at')
      .eq('class_group_id', params.id)
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ results: [] })
      throw error
    }
    return NextResponse.json({
      results: (data ?? []).map(r => ({ ...r, final_grade: r.final_grade === null ? null : Number(r.final_grade) })),
    })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const body = await request.json().catch(() => ({})) as {
      journey_id?: string
      status?: unknown
      final_grade?: unknown
      note?: unknown
    }
    if (!body.journey_id) return apiError('entry_journey_id_required', 400)
    if (!isCourseResultStatus(body.status)) return apiError('course_status_invalid', 400)
    const finalGrade = body.final_grade === undefined || body.final_grade === '' ? null : body.final_grade
    if (!isValidFinalGrade(finalGrade)) return apiError('final_grade_invalid', 400)
    const note = typeof body.note === 'string' && body.note.trim() !== '' ? body.note.trim().slice(0, 2000) : null

    const sb = createServerClient()
    const target = await getClassGroupTarget(sb, params.id)
    if (!target) return apiError('group_not_found', 404)
    const session = await requireEducationPrivilege('set_grades', target)

    const enrolled = await getEnrolledJourneyIds(sb, params.id)
    if (!enrolled.has(body.journey_id)) return apiError('student_not_in_group', 400)

    const { data, error } = await sb
      .from('course_results')
      .upsert({
        class_group_id: params.id,
        journey_id: body.journey_id,
        status: body.status,
        final_grade: finalGrade,
        note,
        updated_by: session.person_id,
      }, { onConflict: 'class_group_id,journey_id' })
      .select('journey_id, status, final_grade, note, updated_at')
      .single()
    if (error) {
      if (isMissingTable(error)) return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ result: data })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
