import type { SessionPayload } from '@/lib/auth/jwt'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/supabase/errors'
import { createNotifications } from '@/lib/notifications/create'
import { hasOverlappingAppointment, overlappingLesson } from '@/lib/calendar/overlap'
import { db, delegateIdsOf, personNames, MEETING_COLS } from './access'
import { isoToMinutes, freeSlots, eventBusyRange, type MinuteRange, type MeetingRow } from './rules'

type SB = ReturnType<typeof createServerClient>

export interface AttendeeOut { person_id: string; name: string; status: string }

/** Участники встреч пачкой: appointment_id → [{ person_id, name, status }]. */
export async function attendeesFor(sb: SB, ids: string[]): Promise<Map<string, AttendeeOut[]>> {
  const out = new Map<string, AttendeeOut[]>()
  if (ids.length === 0) return out
  const { data, error } = await db(sb).from('appointment_attendees').select('appointment_id, person_id, status').in('appointment_id', ids)
  if (error) {
    if (isMissingTable(error)) return out
    throw error
  }
  const rows = (data ?? []) as Array<{ appointment_id: string; person_id: string; status: string }>
  const names = await personNames(sb, rows.map(r => r.person_id))
  for (const r of rows) {
    const arr = out.get(r.appointment_id) ?? []
    arr.push({ person_id: r.person_id, name: names.get(r.person_id) ?? '', status: r.status })
    out.set(r.appointment_id, arr)
  }
  return out
}

/** Студентка встречи (journey → person): journey_id → { person_id, name }. */
export async function studentsFor(sb: SB, journeyIds: Array<string | null>): Promise<Map<string, { person_id: string; name: string }>> {
  const ids = [...new Set(journeyIds.filter((x): x is string => !!x))]
  const out = new Map<string, { person_id: string; name: string }>()
  if (ids.length === 0) return out
  const { data, error } = await db(sb).from('education_journeys').select('id, person_id').in('id', ids)
  if (error) throw error
  const rows = (data ?? []) as Array<{ id: string; person_id: string }>
  const names = await personNames(sb, rows.map(r => r.person_id))
  for (const r of rows) out.set(r.id, { person_id: r.person_id, name: names.get(r.person_id) ?? '' })
  return out
}

/** Встречи владельца в диапазоне дат (по началу). Без редактирования полей. */
export async function ownerMeetings(sb: SB, ownerId: string, from: string, to: string): Promise<MeetingRow[]> {
  const out: MeetingRow[] = []
  const PAGE = 1000
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db(sb).from('appointments').select(MEETING_COLS)
      .eq('provider_id', ownerId)
      .gte('starts_at', `${from}T00:00:00`)
      .lte('starts_at', `${to}T23:59:59.999`)
      .order('starts_at', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const page = (data ?? []) as MeetingRow[]
    out.push(...page)
    if (page.length < PAGE) break
  }
  return out
}

export interface DayBusy {
  blocked: boolean
  busy: Array<{ start: number; end: number; kind: 'meeting' | 'lesson' | 'event' }>
  free: MinuteRange[]
}

/**
 * Занятость дня владельца: запланированные встречи, его уроки, выходной.
 * Секретарю отдаются только интервалы — без названий встреч сверх того, что
 * она и так видит в списке.
 */
export async function dayBusy(sb: SB, ownerId: string, date: string): Promise<DayBusy> {
  const busy: DayBusy['busy'] = []

  const { data: appts, error } = await db(sb).from('appointments').select('starts_at, ends_at, status')
    .eq('provider_id', ownerId).eq('status', 'scheduled')
    .gte('starts_at', `${date}T00:00:00`).lte('starts_at', `${date}T23:59:59.999`)
  if (error) throw error
  for (const a of (appts ?? []) as Array<{ starts_at: string; ends_at: string }>) {
    const s = isoToMinutes(a.starts_at)
    const e = a.ends_at.slice(0, 10) === date ? isoToMinutes(a.ends_at) : 24 * 60
    if (s !== null && e !== null) busy.push({ start: s, end: e, kind: 'meeting' })
  }

  const { data: ct } = await db(sb).from('class_teachers').select('class_group_id').eq('teacher_id', ownerId)
  const groupIds = [...new Set(((ct ?? []) as Array<{ class_group_id: string }>).map(r => r.class_group_id))]
  if (groupIds.length > 0) {
    const { data: lessons } = await db(sb).from('lessons').select('*').in('class_group_id', groupIds).eq('scheduled_date', date)
    for (const l of (lessons ?? []) as Array<{ scheduled_time: string | null; scheduled_end_time?: string | null; is_cancelled?: boolean }>) {
      if (l.is_cancelled || !l.scheduled_time) continue
      const s = isoToMinutes(`T${l.scheduled_time}`)
      if (s === null) continue
      const e = l.scheduled_end_time ? isoToMinutes(`T${l.scheduled_end_time}`) ?? s + 60 : s + 60
      busy.push({ start: s, end: e, kind: 'lesson' })
    }
  }

  for (const ev of await ownerEventRows(sb, ownerId, date, date)) {
    const r = eventBusyRange(ev.event_time, ev.all_day)
    if (r) busy.push({ start: r[0], end: r[1], kind: 'event' })
  }

  const { data: block } = await db(sb).from('calendar_blocks').select('id').eq('provider_id', ownerId).eq('block_date', date).maybeSingle()
  const blocked = !!block
  busy.sort((a, b) => a.start - b.start)
  return { blocked, busy, free: blocked ? [] : freeSlots(busy.map(b => [b.start, b.end] as MinuteRange)) }
}

export interface OwnerEventRow {
  id: string
  title: string
  event_date: string
  event_time: string | null
  all_day: boolean
  created_by: string | null
}

/** Личные события владельца (calendar_events) в диапазоне дат. Нет таблицы → пусто. */
export async function ownerEventRows(sb: SB, ownerId: string, from: string, to: string): Promise<OwnerEventRow[]> {
  const { data, error } = await db(sb).from('calendar_events')
    .select('id, title, event_date, event_time, all_day, created_by')
    .eq('owner_id', ownerId)
    .gte('event_date', from)
    .lte('event_date', to)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true, nullsFirst: true })
    .limit(2000)
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return (data ?? []) as OwnerEventRow[]
}

/**
 * Событие владельца, на которое попадает интервал встречи (startsAt..endsAt,
 * один день). События «весь день» не блокируют. → { time: 'HH:mm' } | null.
 */
export async function overlappingEvent(sb: SB, ownerId: string, startsAt: string, endsAt: string): Promise<{ time: string } | null> {
  const date = startsAt.slice(0, 10)
  const aStart = isoToMinutes(startsAt)
  const aEnd = endsAt.slice(0, 10) === date ? isoToMinutes(endsAt) : 24 * 60
  if (aStart === null || aEnd === null) return null
  for (const ev of await ownerEventRows(sb, ownerId, date, date)) {
    const r = eventBusyRange(ev.event_time, ev.all_day)
    if (r && aStart < r[1] && r[0] < aEnd) {
      return { time: `${String(Math.floor(r[0] / 60)).padStart(2, '0')}:${String(r[0] % 60).padStart(2, '0')}` }
    }
  }
  return null
}

export type BookResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'overlap' | 'lesson' | 'blocked' | 'event'; time?: string }

/**
 * Назначает встречу в календарь владельца (сам владелец или его секретарь).
 * Те же защиты, что в личном календаре: нет пересечения с его запланированными
 * встречами и с его уроками; плюс — не в его выходной день.
 */
export async function bookMeeting(sb: SB, args: {
  ownerId: string
  createdBy: string
  title: string
  startsAt: string
  endsAt: string
  journeyId?: string | null
  reason?: string | null
  prepNotes?: string | null
  attendees?: Array<{ person_id: string; status: 'invited' | 'accepted' }>
}): Promise<BookResult> {
  const date = args.startsAt.slice(0, 10)
  const { data: block } = await db(sb).from('calendar_blocks').select('id').eq('provider_id', args.ownerId).eq('block_date', date).maybeSingle()
  if (block) return { ok: false, reason: 'blocked' }
  if (await hasOverlappingAppointment(sb, args.ownerId, args.startsAt, args.endsAt)) return { ok: false, reason: 'overlap' }
  const lesson = await overlappingLesson(sb, args.ownerId, args.startsAt, args.endsAt)
  if (lesson) return { ok: false, reason: 'lesson', time: lesson.time }
  const ev = await overlappingEvent(sb, args.ownerId, args.startsAt, args.endsAt)
  if (ev) return { ok: false, reason: 'event', time: ev.time }

  const insert: Record<string, unknown> = {
    provider_id: args.ownerId,
    journey_id: args.journeyId ?? null,
    title: args.title,
    reason: args.reason ?? null,
    starts_at: args.startsAt,
    ends_at: args.endsAt,
    created_by: args.createdBy,
  }
  if (args.prepNotes) insert.prep_notes = args.prepNotes
  const { data, error } = await db(sb).from('appointments').insert(insert).select('id').single()
  if (error) throw error
  const id = (data as { id: string }).id

  const att = (args.attendees ?? []).filter(a => a.person_id !== args.ownerId)
  if (att.length > 0) {
    const { error: aErr } = await db(sb).from('appointment_attendees').insert(
      att.map(a => ({ appointment_id: id, person_id: a.person_id, status: a.status, requires_approval: false })),
    )
    if (aErr) console.error('[meetings] attendees insert:', aErr)
  }
  return { ok: true, id }
}

/** Уведомить владельца календаря и всех, кто его ведёт (кроме автора действия). */
export async function notifyCalendarTeam(sb: SB, ownerId: string, exceptId: string, n: { title: string; body?: string | null; link: string }): Promise<void> {
  const ids = [ownerId, ...(await delegateIdsOf(sb, ownerId))].filter(id => id !== exceptId)
  await createNotifications(sb, [...new Set(ids)].map(person_id => ({
    person_id, type: 'meeting', title: n.title, body: n.body ?? null, link: n.link,
  })))
}

/**
 * Открывает задачу у ответственного за решение/задачу встречи. Возвращает id
 * задачи. Автор задачи — владелец встречи; ответственный получает уведомление.
 */
export async function openTaskForItem(sb: SB, args: {
  creatorId: string
  assigneeId: string
  text: string
  dueDate: string | null
  meeting: { id: string; title: string; starts_at: string }
}): Promise<string | null> {
  const isSelf = args.assigneeId === args.creatorId
  const status = isSelf ? 'in_progress' : 'pending'
  const { data: task, error } = await db(sb).from('tasks').insert({
    title: args.text.slice(0, 500),
    description: `מתוך פגישה: ${args.meeting.title} (${args.meeting.starts_at.slice(0, 10)})`,
    module: 'general',
    metadata: { appointment_id: args.meeting.id },
    assignee_type: 'person',
    assignee_id: args.assigneeId,
    creator_id: args.creatorId,
    status,
    priority: 'normal',
    due_date: args.dueDate,
    due_all_day: true,
  }).select('id').single()
  if (error) {
    console.error('[meetings] task insert:', error)
    return null
  }
  const taskId = (task as { id: string }).id
  const { error: hErr } = await db(sb).from('task_status_history').insert({
    task_id: taskId, actor_id: args.creatorId, from_status: null, to_status: status, note: 'Задача создана из встречи',
  })
  if (hErr) console.error('[meetings] task history:', hErr)
  if (!isSelf) {
    await createNotifications(sb, [{
      person_id: args.assigneeId, type: 'task_assigned',
      title: `משימה חדשה: ${args.text.slice(0, 120)}`,
      link: `/dashboard/tasks/${taskId}`, metadata: { task_id: taskId },
    }])
  }
  return taskId
}

/** Сессия сотрудника, который может вести календарь владельца. */
export function isStaff(session: SessionPayload): boolean {
  return session.principal !== 'student'
}
