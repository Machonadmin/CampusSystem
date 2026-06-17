import { NextRequest, NextResponse } from 'next/server'
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
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const scope = await getEducationPrivilegeScope(session, 'manage_leads')
    if (scope !== 'all') return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })

    const sb = createServerClient()

    const { data: journey } = await sb
      .from('education_journeys')
      .select('id, is_deleted')
      .eq('id', params.id)
      .maybeSingle()

    if (!journey) return NextResponse.json({ error: 'Лид не найден' }, { status: 404 })
    if (!(journey as unknown as { is_deleted: boolean }).is_deleted) {
      return NextResponse.json({ error: 'Лид не удалён' }, { status: 409 })
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
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
