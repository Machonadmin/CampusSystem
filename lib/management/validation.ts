/**
 * פאנל ניהול — чистая валидация (без БД), общая для API и тестов.
 */

export const GOAL_STATUSES = ['active', 'achieved', 'dropped'] as const
export type GoalStatus = typeof GOAL_STATUSES[number]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^\d{2}:\d{2}(:\d{2})?$/

export function isIsoDateStr(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export function isTimeStr(v: unknown): v is string {
  return typeof v === 'string' && HHMM.test(v)
}

export function isGoalStatus(v: unknown): v is GoalStatus {
  return typeof v === 'string' && (GOAL_STATUSES as readonly string[]).includes(v)
}

export function isProgress(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100
}

/** Обрезать строку; пустая → null. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t.slice(0, max)
}

/**
 * Время напоминания в календаре: накануне в 06:00 UTC (≈ 08:00/09:00 по
 * Израилю). Если этот момент уже прошёл — null, иначе напоминание сработало бы
 * сразу же для прошлых сроков.
 */
export function reminderAtFor(dateISO: string, now: Date): string | null {
  const d = new Date(`${dateISO}T06:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.getTime() > now.getTime() ? d.toISOString() : null
}
