import { createServerClient } from '@/lib/supabase/server'
import { createNotifications } from '@/lib/notifications/create'
import { db, requestTargetIds, personNames } from './access'
import { bookMeeting, notifyCalendarTeam, type BookResult } from './server'
import {
  canApplyRequestAction, statusAfter, cleanText, isValidRange,
  type HandlerAction, type RequesterAction,
} from './rules'

// ─── Заявки на встречу: общая логика для сотрудника и для портала студентки ──

type SB = ReturnType<typeof createServerClient>

export const REQUEST_COLS =
  'id, owner_id, requester_id, journey_id, subject, details, preferred_times, status, proposed_starts_at, proposed_ends_at, response_note, appointment_id, handled_by, handled_at, created_at'

export interface RequestRow {
  id: string
  owner_id: string
  requester_id: string
  journey_id: string | null
  subject: string
  details: string | null
  preferred_times: string | null
  status: string
  proposed_starts_at: string | null
  proposed_ends_at: string | null
  response_note: string | null
  appointment_id: string | null
  handled_by: string | null
  handled_at: string | null
  created_at: string
}

export type RequestError =
  | 'subject_required' | 'invalid_input' | 'target_not_available' | 'not_found'
  | 'action_not_allowed' | 'invalid_time' | 'overlap' | 'lesson' | 'blocked' | 'event'

export async function withNames(sb: SB, rows: RequestRow[]) {
  const names = await personNames(sb, rows.flatMap(r => [r.owner_id, r.requester_id, r.handled_by]))
  return rows.map(r => ({
    ...r,
    owner_name: names.get(r.owner_id) ?? '',
    requester_name: names.get(r.requester_id) ?? '',
    handled_by_name: r.handled_by ? names.get(r.handled_by) ?? '' : null,
    from_student: !!r.journey_id,
  }))
}

export async function createRequest(sb: SB, args: {
  ownerId: unknown
  requesterId: string
  journeyId: string | null
  subject: unknown
  details: unknown
  preferredTimes: unknown
}): Promise<{ ok: true; id: string } | { ok: false; error: RequestError }> {
  const subject = cleanText(args.subject, 300)
  if (subject === undefined) return { ok: false, error: 'invalid_input' }
  if (!subject) return { ok: false, error: 'subject_required' }
  const details = cleanText(args.details, 4000)
  const preferred = cleanText(args.preferredTimes, 500)
  if (details === undefined || preferred === undefined) return { ok: false, error: 'invalid_input' }
  if (typeof args.ownerId !== 'string' || args.ownerId === args.requesterId) return { ok: false, error: 'target_not_available' }
  if (!(await requestTargetIds(sb)).includes(args.ownerId)) return { ok: false, error: 'target_not_available' }

  const { data, error } = await db(sb).from('appointment_requests').insert({
    owner_id: args.ownerId,
    requester_id: args.requesterId,
    journey_id: args.journeyId,
    subject,
    details,
    preferred_times: preferred,
  }).select('id').single()
  if (error) throw error
  const id = (data as { id: string }).id

  const names = await personNames(sb, [args.requesterId])
  await notifyCalendarTeam(sb, args.ownerId, args.requesterId, {
    title: `בקשה לפגישה: ${names.get(args.requesterId) ?? ''}`,
    body: subject,
    link: '/dashboard/meetings?tab=requests',
  })
  return { ok: true, id }
}

function bookError(r: Extract<BookResult, { ok: false }>): RequestError {
  return r.reason
}

/**
 * Действие над заявкой.
 *   handler   (владелец или секретарь): approve (с временем) / decline / propose (с временем)
 *   requester (тот, кто просил):        accept_proposal / decline_proposal / cancel
 * Право действовать проверяет вызывающий маршрут; здесь — переходы и запись.
 */
export async function applyRequestAction(sb: SB, args: {
  request: RequestRow
  actorId: string
  action: HandlerAction | RequesterAction
  startsAt?: unknown
  endsAt?: unknown
  note?: unknown
}): Promise<{ ok: true; appointmentId: string | null } | { ok: false; error: RequestError; time?: string }> {
  const r = args.request
  if (!canApplyRequestAction(r.status, args.action)) return { ok: false, error: 'action_not_allowed' }
  const note = cleanText(args.note, 2000)
  if (note === undefined) return { ok: false, error: 'invalid_input' }

  let appointmentId: string | null = null
  const patch: Record<string, unknown> = { status: statusAfter(args.action) }

  if (args.action === 'approve' || args.action === 'accept_proposal') {
    const starts = args.action === 'approve' ? args.startsAt : r.proposed_starts_at?.slice(0, 16)
    const ends = args.action === 'approve' ? args.endsAt : r.proposed_ends_at?.slice(0, 16)
    if (!isValidRange(starts, ends)) return { ok: false, error: 'invalid_time' }
    const booked = await bookMeeting(sb, {
      ownerId: r.owner_id,
      createdBy: args.actorId,
      title: r.subject,
      startsAt: starts as string,
      endsAt: ends as string,
      journeyId: r.journey_id,
      // Сотрудник-заявитель становится участником (он сам просил — сразу «принял»).
      // Студентка привязана через journey_id и видит встречу в своём портале.
      attendees: r.journey_id ? [] : [{ person_id: r.requester_id, status: 'accepted' }],
    })
    if (!booked.ok) return { ok: false, error: bookError(booked), time: booked.time }
    appointmentId = booked.id
    patch.appointment_id = appointmentId
  }

  if (args.action === 'propose') {
    if (!isValidRange(args.startsAt, args.endsAt)) return { ok: false, error: 'invalid_time' }
    patch.proposed_starts_at = args.startsAt
    patch.proposed_ends_at = args.endsAt
  }

  if (args.action === 'approve' || args.action === 'decline' || args.action === 'propose') {
    patch.handled_by = args.actorId
    patch.handled_at = new Date().toISOString()
    if (note !== null) patch.response_note = note
  }

  const { error } = await db(sb).from('appointment_requests').update(patch).eq('id', r.id).eq('status', r.status)
  if (error) throw error

  // Уведомления.
  if (args.action === 'approve' || args.action === 'decline' || args.action === 'propose') {
    if (!r.journey_id) {
      const title = args.action === 'approve' ? `הבקשה לפגישה אושרה: ${r.subject}`
        : args.action === 'decline' ? `הבקשה לפגישה נדחתה: ${r.subject}`
          : `הוצע מועד אחר לפגישה: ${r.subject}`
      await createNotifications(sb, [{
        person_id: r.requester_id, type: 'meeting', title, body: note ?? null, link: '/dashboard/meetings?tab=my_requests',
      }])
    }
  } else {
    const names = await personNames(sb, [r.requester_id])
    const who = names.get(r.requester_id) ?? ''
    const title = args.action === 'accept_proposal' ? `${who} אישר/ה את המועד שהוצע: ${r.subject}`
      : `${who} ביטל/ה את הבקשה לפגישה: ${r.subject}`
    await notifyCalendarTeam(sb, r.owner_id, args.actorId, { title, link: '/dashboard/meetings?tab=requests' })
  }

  return { ok: true, appointmentId }
}

export async function loadRequest(sb: SB, id: string): Promise<RequestRow | null> {
  const { data, error } = await db(sb).from('appointment_requests').select(REQUEST_COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return (data as RequestRow | null) ?? null
}
