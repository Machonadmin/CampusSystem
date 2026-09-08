// ─── Валидация ввода модуля «Спонсоры» ───────────────────────────────────────
//
// Держим type-guards здесь, чтобы 400 (кривой ввод) возвращался ДО обращения к
// БД, а не долетал до CHECK-колонки и падал 23514 → 500 более общим текстом.
// Зеркалит lib/contacts/validation.ts + lib/finance/validation.ts.

export const SPONSOR_TYPES = ['individual', 'organization', 'foundation'] as const
export type SponsorType = (typeof SPONSOR_TYPES)[number]

export function isSponsorType(v: unknown): v is SponsorType {
  return typeof v === 'string' && (SPONSOR_TYPES as readonly string[]).includes(v)
}

export const DONATION_STATUSES = ['pledged', 'received', 'cancelled'] as const
export type DonationStatus = (typeof DONATION_STATUSES)[number]

export function isDonationStatus(v: unknown): v is DonationStatus {
  return typeof v === 'string' && (DONATION_STATUSES as readonly string[]).includes(v)
}

/**
 * Строгая проверка ISO-даты 'YYYY-MM-DD'. Отсекает и неверный формат, и
 * несуществующие календарные даты (напр. 2026-02-31), чтобы кривой ввод
 * возвращал 400, а не долетал до колонки DATE и падал 22007/22008 → 500.
 * Идентична lib/finance/validation.ts.
 */
export { isIsoDate } from '@/lib/dates'

/**
 * amount пожертвования должен быть конечным числом ≥ 0. Отсекает null/undefined/
 * пустую строку/boolean/массив/объект и NaN/Infinity ДО записи в NUMERIC(12,2) —
 * возвращаем 400, а не даём улететь в CHECK (amount >= 0) → 23514/22003.
 *
 * Принимаем ТОЛЬКО number и строку (форма шлёт строки): иначе Number([]) === 0
 * и Number([7]) === 7 — пустой массив прошёл бы как сумма 0, а массив из одного
 * числа как это число.
 */
export function isValidAmount(v: unknown): boolean {
  if (typeof v !== 'number' && typeof v !== 'string') return false
  if (typeof v === 'string' && v.trim() === '') return false
  const n = Number(v)
  return Number.isFinite(n) && n >= 0
}
