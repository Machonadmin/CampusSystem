import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStaffComp } from '@/lib/finance/staff-comp'

/**
 * DELETE /api/staff-comp/[personId]/chavruta-plus/[assignmentId]
 * Деактивирует пару менторства (is_active=false) — историю начислений сохраняем.
 * Право: manage. Деплой-безопасно (42P01).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { personId: string; assignmentId: string } },
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const { error } = await (sb as unknown as SupabaseClient)
      .from('chavruta_plus_assignments').update({ is_active: false })
      .eq('id', params.assignmentId).eq('teacher_person_id', params.personId)
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
