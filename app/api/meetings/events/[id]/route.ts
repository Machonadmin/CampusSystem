import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { isIsoDate } from '@/lib/calendar/validation'
import { db, canManageCalendar } from '@/lib/meetings/access'
import { canEditOwnerEvent, cleanText, cleanEventTime, isUuid } from '@/lib/meetings/rules'
import { meetingsError } from '@/lib/meetings/http'
import type { SessionPayload } from '@/lib/auth/jwt'

/**
 * Событие в календаре владельца на экране «פגישות».
 *   PATCH  { title?, event_date?, event_time? } — изменить;
 *   DELETE — удалить.
 * Владелец — любое своё событие; секретарь — только то, что добавила сама
 * (canEditOwnerEvent). Заметки и ссылки здесь не трогаются.
 */

type SB = ReturnType<typeof createServerClient>

async function loadEditable(sb: SB, session: SessionPayload, id: string): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  if (!isUuid(id)) return { ok: false, res: apiError('not_found', 404) }
  const { data, error } = await db(sb).from('calendar_events').select('id, owner_id, created_by').eq('id', id).maybeSingle()
  if (error) throw error
  const row = data as { id: string; owner_id: string; created_by: string | null } | null
  if (!row) return { ok: false, res: apiError('not_found', 404) }
  const role = await canManageCalendar(sb, session, row.owner_id)
  // Чужой календарь, который человек не ведёт, — как «нет такого».
  if (!role) return { ok: false, res: apiError('not_found', 404) }
  if (!canEditOwnerEvent({ role, createdBy: row.created_by, me: session.person_id })) {
    return { ok: false, res: apiError('forbidden', 403) }
  }
  return { ok: true }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const session = await requireCalendarUser()
    const sb = createServerClient()
    const chk = await loadEditable(sb, session, id)
    if (!chk.ok) return chk.res

    const body = await request.json().catch(() => ({})) as { title?: unknown; event_date?: unknown; event_time?: unknown }
    const patch: Record<string, unknown> = {}
    if ('title' in body) {
      const t = cleanText(body.title, 300)
      if (!t) return meetingsError(t === undefined ? 'invalid_input' : 'subject_required')
      patch.title = t
    }
    if ('event_date' in body) {
      if (typeof body.event_date !== 'string' || !isIsoDate(body.event_date)) return meetingsError('invalid_time')
      patch.event_date = body.event_date
    }
    if ('event_time' in body) {
      const time = cleanEventTime(body.event_time)
      if (time === undefined) return meetingsError('invalid_time')
      patch.event_time = time
      patch.all_day = !time
    }
    if (Object.keys(patch).length === 0) return meetingsError('invalid_input')

    const { error } = await db(sb).from('calendar_events').update(patch).eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const session = await requireCalendarUser()
    const sb = createServerClient()
    const chk = await loadEditable(sb, session, id)
    if (!chk.ok) return chk.res
    const { error } = await db(sb).from('calendar_events').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
