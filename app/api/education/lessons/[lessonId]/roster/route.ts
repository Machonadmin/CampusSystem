import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getLessonAccess, getEnrolledJourneyIds } from '@/lib/education/lesson-access'
import { isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * Разовый ростер урока: гости (journeys вне группы), добавленные ТОЛЬКО на этот
 * урок, чтобы отметить им посещаемость. См. таблицу lesson_roster_overrides.
 *
 * POST   { journey_id } — добавить гостя на урок.
 * DELETE ?journey_id=… — убрать гостя с урока.
 *
 * Право: mark_attendance в контексте группы урока (тот, кто и так отмечает
 * посещаемость этого урока: учитель группы или руководитель).
 */

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (isMissingTable(error)) return { status: 503, message: serverT('feature_unavailable') }
  if (error.code === '22P02') return { status: 400, message: serverT('invalid_id') }
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference') }
  return { status: 500, message: error.message ?? serverT('db_error') }
}

export async function POST(request: NextRequest, props: { params: Promise<{ lessonId: string }> }) {
  const params = await props.params
  try {
    const body = await request.json().catch(() => ({})) as { journey_id?: string }
    const journeyId = (body.journey_id ?? '').trim()
    if (!journeyId) return apiError('entry_journey_id_required', 400)

    const sb = createServerClient()
    const access = await getLessonAccess(sb, params.lessonId)
    if (!access) return apiError('lesson_not_found', 404)
    const session = await requireEducationPrivilege('mark_attendance', access.target)

    // Гость не может уже быть записан в группу урока (тогда он и так в ростере).
    const enrolled = await getEnrolledJourneyIds(sb, access.lesson.class_group_id)
    if (enrolled.has(journeyId)) return apiError('already_enrolled', 409)

    // journey должен существовать.
    const { data: j, error: jErr } = await sb
      .from('education_journeys').select('id').eq('id', journeyId).maybeSingle()
    if (jErr) throw jErr
    if (!j) return apiError('journey_not_found', 404)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as any)
      .from('lesson_roster_overrides')
      .upsert({ lesson_id: params.lessonId, journey_id: journeyId, created_by: session.person_id },
        { onConflict: 'lesson_id,journey_id' })
    if (error) throw error

    return NextResponse.json({ added: true }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) { const m = mapDbError(e); return errorResponse(m) }
    return errorResponse(e)
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ lessonId: string }> }) {
  const params = await props.params
  try {
    const journeyId = (request.nextUrl.searchParams.get('journey_id') ?? '').trim()
    if (!journeyId) return apiError('entry_journey_id_required', 400)

    const sb = createServerClient()
    const access = await getLessonAccess(sb, params.lessonId)
    if (!access) return apiError('lesson_not_found', 404)
    await requireEducationPrivilege('mark_attendance', access.target)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb as any)
      .from('lesson_roster_overrides')
      .delete()
      .eq('lesson_id', params.lessonId)
      .eq('journey_id', journeyId)
    if (error) throw error

    return NextResponse.json({ removed: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) { const m = mapDbError(e); return errorResponse(m) }
    return errorResponse(e)
  }
}
