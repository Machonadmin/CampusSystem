import { createServerClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/supabase/errors'
import type { SessionPayload } from '@/lib/auth/jwt'
import { reminderAtFor } from './validation'

// ─── פאנל ניהול: доступ к данным + синхронизация с личным календарём ─────────
//
// Таблицы management_* ещё нет в сгенерированных типах БД — работаем через
// нетипизированный клиент (как с student_credentials в других местах).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySB = any

export function db(): AnySB {
  return createServerClient() as AnySB
}

export function isSuperadmin(session: SessionPayload): boolean {
  return (session.roles ?? []).includes('superadmin')
}

/** Ошибка «миграция ещё не применена» → 503 feature_not_migrated. */
export function notMigrated(err: unknown): boolean {
  return isMissingTable(err)
}

export interface MeetingRow {
  id: string
  title: string
  meeting_date: string
  meeting_time: string | null
  summary: string | null
  decisions: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface GoalRow {
  id: string
  title: string
  description: string | null
  owner_id: string | null
  meeting_id: string | null
  start_date: string | null
  target_date: string | null
  status: 'active' | 'achieved' | 'dropped'
  progress: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MilestoneRow {
  id: string
  goal_id: string
  title: string
  due_date: string | null
  owner_id: string | null
  done_at: string | null
  sort_order: number
}

/** Видит ли пользователь אסיפה: создатель, участник или superadmin. */
export async function canSeeMeeting(sb: AnySB, session: SessionPayload, meeting: MeetingRow): Promise<boolean> {
  if (isSuperadmin(session) || meeting.created_by === session.person_id) return true
  const { data } = await sb.from('management_meeting_attendees')
    .select('person_id').eq('meeting_id', meeting.id).eq('person_id', session.person_id).limit(1)
  return Array.isArray(data) && data.length > 0
}

/** Править אסיפה может создатель или superadmin. */
export function canEditMeeting(session: SessionPayload, meeting: MeetingRow): boolean {
  return isSuperadmin(session) || meeting.created_by === session.person_id
}

/**
 * Видит ли пользователь מטרה: создатель, ответственный, ответственный за одну
 * из אבני הדרך, участник אסיפה, где её поставили, или superadmin.
 */
export async function canSeeGoal(sb: AnySB, session: SessionPayload, goal: GoalRow): Promise<boolean> {
  const me = session.person_id
  if (isSuperadmin(session) || goal.created_by === me || goal.owner_id === me) return true
  const { data: ms } = await sb.from('management_goal_milestones')
    .select('id').eq('goal_id', goal.id).eq('owner_id', me).limit(1)
  if (Array.isArray(ms) && ms.length > 0) return true
  if (goal.meeting_id) {
    const { data: att } = await sb.from('management_meeting_attendees')
      .select('person_id').eq('meeting_id', goal.meeting_id).eq('person_id', me).limit(1)
    if (Array.isArray(att) && att.length > 0) return true
  }
  return false
}

/** Править מטרה может создатель, ответственный или superadmin. */
export function canEditGoal(session: SessionPayload, goal: GoalRow): boolean {
  return isSuperadmin(session) || goal.created_by === session.person_id || goal.owner_id === session.person_id
}

// ─── Личный календарь (calendar_events) ──────────────────────────────────────

export interface CalendarItem {
  ownerId: string
  title: string
  date: string
  time?: string | null
  notes?: string | null
}

/**
 * Заменить события календаря одного источника (source_type + source_id) на
 * новый набор. Пустой набор — просто удалить. Best-effort: сбой календаря не
 * ломает сохранение אסיפה/מטרה (ошибка уходит в лог).
 */
export async function replaceCalendarItems(
  sb: AnySB,
  sourceType: 'meeting' | 'goal' | 'goal_milestone',
  sourceId: string,
  link: string,
  items: CalendarItem[],
  createdBy: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const { error: delErr } = await sb.from('calendar_events')
      .delete().eq('source_type', sourceType).eq('source_id', sourceId)
    if (delErr) {
      if (!isMissingTable(delErr)) console.error('[management] calendar delete:', delErr)
      return
    }
    // Один человек — одно событие на источник.
    const seen = new Set<string>()
    const rows = items
      .filter(i => i.ownerId && i.date && !seen.has(i.ownerId) && seen.add(i.ownerId))
      .map(i => ({
        owner_id: i.ownerId,
        title: i.title.slice(0, 300),
        notes: i.notes ?? null,
        event_date: i.date,
        event_time: i.time ?? null,
        all_day: !i.time,
        reminder_at: reminderAtFor(i.date, now),
        source_type: sourceType,
        source_id: sourceId,
        link,
        created_by: createdBy,
      }))
    if (rows.length === 0) return
    const { error: insErr } = await sb.from('calendar_events').insert(rows)
    if (insErr) console.error('[management] calendar insert:', insErr)
  } catch (e) {
    console.error('[management] calendar sync:', e)
  }
}

/** Синхронизировать календарь אסיפה: событие у каждого участника и у создателя. */
export async function syncMeetingCalendar(sb: AnySB, meeting: MeetingRow, attendeeIds: string[], actorId: string): Promise<void> {
  const owners = [...new Set([...(meeting.created_by ? [meeting.created_by] : []), ...attendeeIds])]
  await replaceCalendarItems(sb, 'meeting', meeting.id, `/dashboard/management?meeting=${meeting.id}`,
    owners.map(ownerId => ({ ownerId, title: `אסיפה: ${meeting.title}`, date: meeting.meeting_date, time: meeting.meeting_time })),
    actorId)
}

/** Календарь מטרה: срок у ответственного, пока מטרה активна. */
export async function syncGoalCalendar(sb: AnySB, goal: GoalRow, actorId: string): Promise<void> {
  const items: CalendarItem[] = goal.status === 'active' && goal.target_date && goal.owner_id
    ? [{ ownerId: goal.owner_id, title: `יעד למטרה: ${goal.title}`, date: goal.target_date }]
    : []
  await replaceCalendarItems(sb, 'goal', goal.id, `/dashboard/management?goal=${goal.id}`, items, actorId)
}

/** Календарь אבן דרך: срок у ответственного (или у ответственного за מטרה), пока не выполнена. */
export async function syncMilestoneCalendar(sb: AnySB, ms: MilestoneRow, goal: GoalRow, actorId: string): Promise<void> {
  const owner = ms.owner_id ?? goal.owner_id
  const items: CalendarItem[] = !ms.done_at && ms.due_date && owner && goal.status === 'active'
    ? [{ ownerId: owner, title: `אבן דרך: ${ms.title} (${goal.title})`, date: ms.due_date }]
    : []
  await replaceCalendarItems(sb, 'goal_milestone', ms.id, `/dashboard/management?goal=${goal.id}`, items, actorId)
}
