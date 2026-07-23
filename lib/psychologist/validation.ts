// ─── Валидация ввода модуля «Психолог» ──────────────────────────────────────
//
// Держим type-guards здесь, чтобы 400 (кривой ввод) возвращался ДО обращения к
// БД, а не долетал до CHECK/DATE колонки и падал 23514/22007 → 500 более общим
// текстом. Зеркалит lib/doctor/validation.ts (там isVisitStatus); здесь у сессии
// есть ещё и тип (session_type), а у карты — уровень риска (risk_level), поэтому
// добавлены соответствующие guard-ы.

export const SESSION_STATUSES = ['open', 'closed'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

export function isSessionStatus(v: unknown): v is SessionStatus {
  return typeof v === 'string' && (SESSION_STATUSES as readonly string[]).includes(v)
}

export const SESSION_TYPES = ['intake', 'followup', 'crisis', 'group', 'other'] as const
export type SessionType = (typeof SESSION_TYPES)[number]

export function isSessionType(v: unknown): v is SessionType {
  return typeof v === 'string' && (SESSION_TYPES as readonly string[]).includes(v)
}

export const RISK_LEVELS = ['none', 'low', 'medium', 'high'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export function isRiskLevel(v: unknown): v is RiskLevel {
  return typeof v === 'string' && (RISK_LEVELS as readonly string[]).includes(v)
}

/**
 * Строгая проверка ISO-даты 'YYYY-MM-DD'. Отсекает и неверный формат, и
 * несуществующие календарные даты (напр. 2026-02-31), чтобы кривой ввод
 * возвращал 400, а не долетал до колонки DATE и падал 22007/22008 → 500.
 * Зеркалит lib/doctor/validation.ts.
 */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
