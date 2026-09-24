import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDecideTeacherAttendance } from '@/lib/education/teacher-attendance-access'
import { isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * PATCH /api/education/teacher-attendance/[id]
 *   { decision: 'approved' | 'rejected' } — секретариат подтверждает/отклоняет
 *   отметку присутствия преподавателя. Доступ: manage_students / superadmin.
 * Деплой-безопасно (42P01 → 503).
 */

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const id = (params.id ?? '').trim()
    if (!id) return apiError('invalid_reference', 400)

    const body = await request.json().catch(() => ({})) as { decision?: string }
    const decision = (body.decision ?? '').trim()
    if (decision !== 'approved' && decision !== 'rejected') return apiError('invalid_reference', 400)

    const sb = createServerClient()
    try {
      const { data: row } = await sb.from('teacher_attendance').select('id, status, lesson_id').eq('id', id).maybeSingle()
      if (!row) return apiError('substage_not_found', 404)

      // Только менеджер подразделения урока (см. canDecideTeacherAttendance).
      const lessonId = (row as { lesson_id: string }).lesson_id
      const allowed = await canDecideTeacherAttendance(session, sb, lessonId)
      if (!allowed) return apiError('forbidden', 403)

      const { error } = await sb.from('teacher_attendance')
        .update({ status: decision, decided_by: session.person_id, decided_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    } catch (e) {
      if (isMissingTable(e)) return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
