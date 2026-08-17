import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'

/**
 * PATCH /api/education/teacher-attendance/[id]
 *   { decision: 'approved' | 'rejected' } — секретариат подтверждает/отклоняет
 *   отметку присутствия преподавателя. Доступ: manage_students / superadmin.
 * Деплой-безопасно (42P01 → 503).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const canApprove = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_students')
    if (!canApprove) return apiError('forbidden', 403)

    const id = (params.id ?? '').trim()
    if (!id) return apiError('invalid_reference', 400)

    const body = await request.json().catch(() => ({})) as { decision?: string }
    const decision = (body.decision ?? '').trim()
    if (decision !== 'approved' && decision !== 'rejected') return apiError('invalid_reference', 400)

    const sb = createServerClient()
    try {
      const { data: row } = await u(sb).from('teacher_attendance').select('id, status').eq('id', id).maybeSingle()
      if (!row) return apiError('substage_not_found', 404)
      const { error } = await u(sb).from('teacher_attendance')
        .update({ status: decision, decided_by: session.person_id, decided_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
