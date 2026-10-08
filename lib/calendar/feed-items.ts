// Превращение строк БД в события iCal-фида (Google Calendar).
// Чистые функции — без сети/БД, чтобы легко тестировать. Сбор строк из БД
// (с теми же правилами доступа, что и календарь в приложении) — в
// app/api/public/calendar-feed/route.ts.

import { toFloating, wallClockFloating, type IcsEvent } from './ics'

export type FeedEventRow = {
  id: string; title: string | null; notes: string | null
  event_date: string; event_time: string | null; all_day: boolean | null
}

export type FeedApptRow = {
  id: string; title: string | null; reason: string | null
  starts_at: string; ends_at: string; status: string | null
}

export type FeedTaskRow = {
  id: string; title: string | null
  due_date: string; due_time: string | null; due_all_day: boolean | null
}

export type FeedLessonRow = {
  id: string
  scheduled_date: string
  scheduled_time: string | null
  scheduled_end_time: string | null
  location: string | null
  topic: string | null
  is_cancelled: boolean | null
  /** Название учебной группы (class_groups.name). */
  group_name: string | null
  /** Предмет: name_he, иначе name. */
  subject_he: string | null
  subject: string | null
}

/** Личные события календаря (calendar_events). */
export function personalEventsToIcs(rows: FeedEventRow[]): IcsEvent[] {
  return rows.map(e => {
    const summary = e.title ?? '(ללא כותרת)'
    const description = e.notes ?? undefined
    return e.all_day || !e.event_time
      ? { uid: `event-${e.id}@campus`, summary, description, kind: 'allday', date: e.event_date }
      : { uid: `event-${e.id}@campus`, summary, description, kind: 'floating', start: toFloating(e.event_date, e.event_time) }
  })
}

/**
 * Встречи (свои + куда пригласили). Одна встреча = одно событие (дедуп по id:
 * пользователь может быть и создателем, и участником). Отменённые встречи и
 * встречи из `skipIds` (например, приглашения, которые пользователь отклонил)
 * не включаем. Время встречи «настенное» (см. wallClockFloating), не UTC —
 * фикс c1ee3e22.
 */
export function appointmentsToIcs(rows: FeedApptRow[], skipIds: ReadonlySet<string> = new Set()): IcsEvent[] {
  const out: IcsEvent[] = []
  const seen = new Set<string>()
  for (const a of rows) {
    if (seen.has(a.id)) continue
    seen.add(a.id)
    if (a.status === 'cancelled' || skipIds.has(a.id)) continue
    const start = wallClockFloating(a.starts_at)
    if (!start) continue
    out.push({
      uid: `appt-${a.id}@campus`,
      summary: a.title ?? 'פגישה',
      description: a.reason ?? undefined,
      kind: 'floating', start, end: wallClockFloating(a.ends_at) ?? undefined,
    })
  }
  return out
}

/** Открытые задачи пользователя со сроком. */
export function tasksToIcs(rows: FeedTaskRow[]): IcsEvent[] {
  return rows.map(tk => {
    const summary = `✓ ${tk.title ?? ''}`.trim()
    return tk.due_all_day || !tk.due_time
      ? { uid: `task-${tk.id}@campus`, summary, kind: 'allday', date: tk.due_date }
      : { uid: `task-${tk.id}@campus`, summary, kind: 'floating', start: toFloating(tk.due_date, tk.due_time) }
  })
}

/**
 * Уроки учебных групп пользователя (как преподавателя и как студентки).
 * Отменённые уроки не включаем. Урок без времени — событие на весь день.
 * Заголовок: «📚 предмет · группа» (иврит предмета, иначе базовое имя).
 */
export function lessonsToIcs(rows: FeedLessonRow[]): IcsEvent[] {
  const out: IcsEvent[] = []
  const seen = new Set<string>()
  for (const l of rows) {
    if (seen.has(l.id)) continue
    seen.add(l.id)
    if (l.is_cancelled) continue
    const subject = (l.subject_he || l.subject || '').trim()
    const group = (l.group_name ?? '').trim()
    const name = [subject, group].filter(Boolean).join(' · ') || 'שיעור'
    const summary = `📚 ${name}`
    const description = l.topic?.trim() || undefined
    const location = l.location?.trim() || undefined
    const uid = `lesson-${l.id}@campus`
    if (!l.scheduled_time) {
      out.push({ uid, summary, description, location, kind: 'allday', date: l.scheduled_date })
      continue
    }
    const start = toFloating(l.scheduled_date, l.scheduled_time)
    const end = l.scheduled_end_time ? toFloating(l.scheduled_date, l.scheduled_end_time) : undefined
    out.push({ uid, summary, description, location, kind: 'floating', start, end: end && end > start ? end : undefined })
  }
  return out
}
