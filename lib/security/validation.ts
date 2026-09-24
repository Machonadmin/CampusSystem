// ─── Валидация ввода модуля «Безопасность» ──────────────────────────────────
//
// Централизованные наборы допустимых значений и type-guards. Держим здесь,
// чтобы 400 (кривой ввод) возвращался ДО обращения к БД, а не долетал до
// CHECK-ограничения колонки и падал 23514 → 400 более общим текстом.
// Зеркалит lib/maintenance/validation.ts.

export const CATEGORIES = [
  'theft', 'vandalism', 'trespassing', 'altercation', 'fire', 'medical', 'property_damage', 'other',
] as const
export type Category = (typeof CATEGORIES)[number]

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export type SeverityValue = (typeof SEVERITIES)[number]

export const STATUSES = ['open', 'investigating', 'resolved', 'closed'] as const
export type StatusValue = (typeof STATUSES)[number]

export function isCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v)
}

export function isSeverity(v: unknown): v is SeverityValue {
  return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v)
}

export function isStatus(v: unknown): v is StatusValue {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v)
}
