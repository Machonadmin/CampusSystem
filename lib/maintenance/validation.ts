// ─── Валидация ввода модуля «Эксплуатация» ──────────────────────────────────
//
// Централизованные наборы допустимых значений и type-guards. Держим здесь,
// чтобы 400 (кривой ввод) возвращался ДО обращения к БД, а не долетал до
// CHECK-ограничения колонки и падал 23514 → 400 более общим текстом.

export const CATEGORIES = ['plumbing', 'electrical', 'furniture', 'cleaning', 'appliance', 'other'] as const
export type Category = (typeof CATEGORIES)[number]

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type PriorityValue = (typeof PRIORITIES)[number]

export const STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'cancelled'] as const
export type StatusValue = (typeof STATUSES)[number]

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
}

export function isPriority(v: unknown): v is PriorityValue {
  return typeof v === 'string' && (PRIORITIES as readonly string[]).includes(v)
}

export function isStatus(v: unknown): v is StatusValue {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v)
}

/**
 * Строгая проверка ISO-даты 'YYYY-MM-DD'. Отсекает и неверный формат, и
 * несуществующие календарные даты (напр. 2026-02-31). Зеркалит lib/food/validation.ts;
 * оставлено для единообразия модулей (в текущем MVP даты задаёт сервер).
 */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
