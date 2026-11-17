import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { canManageCalendar } from '@/lib/meetings/access'
import { applyRequestAction, loadRequest } from '@/lib/meetings/requests'
import { meetingsError } from '@/lib/meetings/http'
import type { HandlerAction, RequesterAction } from '@/lib/meetings/rules'

const HANDLER: HandlerAction[] = ['approve', 'decline', 'propose']
const REQUESTER: RequesterAction[] = ['accept_proposal', 'decline_proposal', 'cancel']

/**
 * PATCH /api/meetings/requests/[id] { action, starts_at?, ends_at?, note? }
 *   approve / decline / propose — владелец календаря или его секретарь;
 *   accept_proposal / decline_proposal / cancel — сотрудник, который просил.
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const session = await requireCalendarUser()
    const sb = createServerClient()
    const req = await loadRequest(sb, id)
    if (!req) return apiError('record_not_found', 404)
    const body = await request.json().catch(() => ({})) as { action?: string; starts_at?: unknown; ends_at?: unknown; note?: unknown }

    if (HANDLER.includes(body.action as HandlerAction)) {
      if (!(await canManageCalendar(sb, session, req.owner_id))) return apiError('forbidden', 403)
    } else if (REQUESTER.includes(body.action as RequesterAction)) {
      if (req.requester_id !== session.person_id) return apiError('forbidden', 403)
    } else {
      return meetingsError('invalid_input')
    }

    const r = await applyRequestAction(sb, {
      request: req, actorId: session.person_id, action: body.action as HandlerAction | RequesterAction,
      startsAt: body.starts_at, endsAt: body.ends_at, note: body.note,
    })
    if (!r.ok) return meetingsError(r.error, r.time)
    return NextResponse.json({ ok: true, appointment_id: r.appointmentId })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
