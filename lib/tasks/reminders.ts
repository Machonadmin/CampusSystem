/**
 * תזמון תזכורות למשימות — чистая логика (без БД, без Date.now()), общая для
 * cron (lib/notifications/task-reminders.ts), API и клиента (выбор в форме).
 *
 *   • раннее напоминание: remind_days_before = N (2..30) — ровно за N дней;
 *   • после просрочки: на 1-й, 3-й и 7-й день просрочки.
 */

export const OVERDUE_REMIND_DAYS = [1, 3, 7] as const
export const REMIND_DAYS_BEFORE_OPTIONS = [2, 3, 7, 14] as const
export const REMIND_DAYS_BEFORE_MIN = 2
export const REMIND_DAYS_BEFORE_MAX = 30

export type TaskReminder =
  | { kind: 'early'; days: number; key: string }
  | { kind: 'overdue'; days: number; key: string }

const DAY_MS = 86_400_000

/** Разница в днях между двумя ISO-датами (b - a), без часовых поясов. */
export function daysBetween(aISO: string, bISO: string): number {
  const a = Date.UTC(+aISO.slice(0, 4), +aISO.slice(5, 7) - 1, +aISO.slice(8, 10))
  const b = Date.UTC(+bISO.slice(0, 4), +bISO.slice(5, 7) - 1, +bISO.slice(8, 10))
  return Math.round((b - a) / DAY_MS)
}

/** Сдвинуть ISO-дату на n дней. */
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * DAY_MS)
  return d.toISOString().slice(0, 10)
}

/** Допустимое ли значение remind_days_before (null — «без раннего напоминания»). */
export function isValidRemindDaysBefore(v: unknown): v is number | null {
  if (v === null) return true
  return typeof v === 'number' && Number.isInteger(v) && v >= REMIND_DAYS_BEFORE_MIN && v <= REMIND_DAYS_BEFORE_MAX
}

/**
 * Какое напоминание положено задаче сегодня (чистая функция).
 * null — сегодня ничего не положено.
 */
export function taskReminderFor(
  todayISO: string,
  dueISO: string | null,
  remindDaysBefore: number | null | undefined,
): TaskReminder | null {
  if (!dueISO) return null
  const diff = daysBetween(todayISO, dueISO) // >0 — срок впереди, <0 — просрочено
  if (diff < 0) {
    const late = -diff
    return (OVERDUE_REMIND_DAYS as readonly number[]).includes(late)
      ? { kind: 'overdue', days: late, key: `overdue-${late}` }
      : null
  }
  if (remindDaysBefore != null && remindDaysBefore >= REMIND_DAYS_BEFORE_MIN && diff === remindDaysBefore) {
    return { kind: 'early', days: diff, key: `early-${diff}` }
  }
  return null
}

/** Заголовок уведомления (иврит, как у остальных напоминаний задач). */
export function taskReminderTitle(r: TaskReminder, title: string): string {
  if (r.kind === 'early') return `תזכורת, בעוד ${r.days} ימים: ${title}`
  return r.days === 1
    ? `משימה באיחור של יום: ${title}`
    : `משימה באיחור של ${r.days} ימים: ${title}`
}
