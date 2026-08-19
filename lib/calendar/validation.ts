// ─── Валидация ввода модуля «Календарь» ─────────────────────────────────────
//
// Type-guards держим здесь, чтобы 400 (кривой ввод) возвращался ДО обращения к
// БД, а не долетал до колонки timestamptz/date/CHECK и падал 22007/23514 → 500
// более общим текстом.

export const APPOINTMENT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export function isAppointmentStatus(v: unknown): v is AppointmentStatus {
  return typeof v === 'string' && (APPOINTMENT_STATUSES as readonly string[]).includes(v)
}

/**
 * Строгая проверка ISO-даты 'YYYY-MM-DD'. Отсекает и неверный формат, и
 * несуществующие календарные даты (напр. 2026-02-31). Зеркалит остальные модули.
 */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/**
 * Проверка ISO-таймстемпа. Принимает как момент с TZ-суффиксом
 * ('2026-07-08T10:00:00Z', '…+03:00'), так и локальное время без суффикса
 * ('2026-07-08T10:00'), которое присылает <input type="datetime-local">.
 * Требует минимум 'YYYY-MM-DDTHH:mm' и разбираемость Date.parse.
 */
export function isIsoDateTime(s: unknown): s is string {
  if (typeof s !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return false
  return !Number.isNaN(Date.parse(s))
}
