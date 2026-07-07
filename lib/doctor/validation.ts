// ─── Валидация ввода модуля «Медпункт» ──────────────────────────────────────
//
// Держим type-guards здесь, чтобы 400 (кривой ввод) возвращался ДО обращения к
// БД, а не долетал до CHECK/DATE колонки и падал 23514/22007 → 500 более общим
// текстом.

export const VISIT_STATUSES = ['open', 'closed'] as const
export type VisitStatus = (typeof VISIT_STATUSES)[number]

export function isVisitStatus(v: unknown): v is VisitStatus {
  return typeof v === 'string' && (VISIT_STATUSES as readonly string[]).includes(v)
}

/**
 * Строгая проверка ISO-даты 'YYYY-MM-DD'. Отсекает и неверный формат, и
 * несуществующие календарные даты (напр. 2026-02-31), чтобы кривой ввод
 * возвращал 400, а не долетал до колонки DATE и падал 22007/22008 → 500.
 * Зеркалит lib/food/validation.ts.
 */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
