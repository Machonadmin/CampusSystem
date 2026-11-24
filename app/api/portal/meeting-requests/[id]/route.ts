import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { errorResponse } from '@/lib/api/handler'
import { applyRequestAction, loadRequest } from '@/lib/meetings/requests'
import { meetingsError } from '@/lib/meetings/http'
import type { RequesterAction } from '@/lib/meetings/rules'

const ACTIONS: RequesterAction[] = ['accept_proposal', 'decline_proposal', 'cancel']

/**
 * PATCH /api/portal/meeting-requests/[id] { action } — студентка отвечает на
 * предложенное время (accept_proposal / decline_proposal) или отменяет заявку.
 * Только своя заявка (requester = person из сессии, principal='student').
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal !== 'student' || !session.student_journey_id) return apiError('forbidden', 403)
    const { id } = await props.params
    const sb = createServerClient()
    const req = await loadRequest(sb, id)
    if (!req || req.requester_id !== session.person_id) return apiError('record_not_found', 404)
    const body = await request.json().catch(() => ({})) as { action?: string }
    if (!ACTIONS.includes(body.action as RequesterAction)) return meetingsError('invalid_input')
    const r = await applyRequestAction(sb, { request: req, actorId: session.person_id, action: body.action as RequesterAction })
    if (!r.ok) return meetingsError(r.error, r.time)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
