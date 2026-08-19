import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getEducationPrivilegeScope } from '@/lib/education/permissions'

/**
 * POST /api/education/leads/[id]/restore
 * Восстанавливает мягко-удалённого лида.
 * Требует: manage_leads + scope=all
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const scope = await getEducationPrivilegeScope(session, 'manage_leads')
    if (scope !== 'all') return apiError('forbidden', 403)

    const sb = createServerClient()

    const { data: journey } = await sb
      .from('education_journeys')
      .select('id, is_deleted')
      .eq('id', params.id)
      .maybeSingle()

    if (!journey) return apiError('lead_not_found', 404)
    if (!(journey as unknown as { is_deleted: boolean }).is_deleted) {
      return apiError('lead_not_deleted', 409)
    }

    const { error } = await sb
      .from('education_journeys')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ is_deleted: false, deleted_at: null, deleted_by: null } as any)
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
