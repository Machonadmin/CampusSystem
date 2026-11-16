import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { db, personNames } from '@/lib/meetings/access'
import { isUuid } from '@/lib/meetings/rules'
import { createNotifications } from '@/lib/notifications/create'
import type { SessionPayload } from '@/lib/auth/jwt'

/**
 * Кто ведёт чей календарь (מזכירת המנהל).
 *   GET    — свои назначения; superadmin видит все.
 *   POST   { delegate_id, owner_id? } — владелец добавляет секретаря к СВОЕМУ
 *          календарю; superadmin может указать любого владельца.
 *   DELETE ?delegate_id&owner_id — снять.
 */

function ownerFor(session: SessionPayload, requested: unknown): string | null {
  if (requested === undefined || requested === null || requested === '' || requested === session.person_id) return session.person_id
  if (!session.roles.includes('superadmin')) return null
  return isUuid(requested) ? requested : null
}

export async function GET() {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()
    let q = db(sb).from('calendar_delegates').select('owner_id, delegate_id, created_at').order('created_at')
    if (!session.roles.includes('superadmin')) q = q.or(`owner_id.eq.${session.person_id},delegate_id.eq.${session.person_id}`)
    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as Array<{ owner_id: string; delegate_id: string }>
    const names = await personNames(sb, rows.flatMap(r => [r.owner_id, r.delegate_id]))
    return NextResponse.json({
      delegations: rows.map(r => ({
        owner_id: r.owner_id, owner_name: names.get(r.owner_id) ?? '',
        delegate_id: r.delegate_id, delegate_name: names.get(r.delegate_id) ?? '',
      })),
    })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const body = await request.json().catch(() => ({})) as { delegate_id?: unknown; owner_id?: unknown }
    const ownerId = ownerFor(session, body.owner_id)
    if (!ownerId) return apiError('forbidden', 403)
    if (!isUuid(body.delegate_id) || body.delegate_id === ownerId) return apiError('meetings_delegate_invalid', 400)

    const sb = createServerClient()
    // Секретарь — действующий сотрудник с учётной записью.
    const { data: acc } = await db(sb).from('person_accounts').select('person_id').eq('person_id', body.delegate_id).eq('is_active', true).limit(1).maybeSingle()
    if (!acc) return apiError('meetings_delegate_invalid', 400)

    const { error } = await db(sb).from('calendar_delegates')
      .upsert({ owner_id: ownerId, delegate_id: body.delegate_id, created_by: session.person_id }, { onConflict: 'owner_id,delegate_id', ignoreDuplicates: true })
    if (error) throw error

    const names = await personNames(sb, [ownerId])
    await createNotifications(sb, [{
      person_id: body.delegate_id, type: 'meeting',
      title: `נוספת לניהול היומן של ${names.get(ownerId) ?? ''}`,
      link: '/dashboard/meetings',
    }])
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const delegateId = request.nextUrl.searchParams.get('delegate_id')
    const ownerParam = request.nextUrl.searchParams.get('owner_id')
    if (!isUuid(delegateId)) return apiError('meetings_delegate_invalid', 400)
    // Секретарь может и сама выйти из ведения чужого календаря.
    const ownerId = delegateId === session.person_id && isUuid(ownerParam) ? ownerParam : ownerFor(session, ownerParam)
    if (!ownerId) return apiError('forbidden', 403)

    const sb = createServerClient()
    const { error } = await db(sb).from('calendar_delegates').delete().eq('owner_id', ownerId).eq('delegate_id', delegateId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
