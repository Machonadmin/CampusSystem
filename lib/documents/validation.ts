// ─── Валидация ввода модуля «Документы» ─────────────────────────────────────
//
// Держим type-guards здесь, чтобы 400 (кривой ввод) возвращался ДО обращения к
// БД, а не долетал до CHECK/DATE колонки и падал 23514/22007 → 500 более общим
// текстом. Зеркалит lib/doctor/validation.ts.

export const DOC_TYPES = [
  'id_card', 'passport', 'certificate', 'medical',
  'financial', 'contract', 'visa', 'other',
] as const
export type DocType = (typeof DOC_TYPES)[number]

export function isDocType(v: unknown): v is DocType {
  return typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v)
}

export const DOC_STATUSES = ['active', 'archived'] as const
export type DocStatus = (typeof DOC_STATUSES)[number]

export function isDocStatus(v: unknown): v is DocStatus {
  return typeof v === 'string' && (DOC_STATUSES as readonly string[]).includes(v)
}

// Категория документа (группировка по спецификации): общие / еврейство /
// учёба / общежитие / прочее. Отдельно от doc_type (вид документа).
export const DOC_CATEGORIES = ['general', 'jewish', 'academic', 'dormitory', 'other'] as const
export type DocCategory = (typeof DOC_CATEGORIES)[number]

export function isDocCategory(v: unknown): v is DocCategory {
  return typeof v === 'string' && (DOC_CATEGORIES as readonly string[]).includes(v)
}

// Статус проверки загруженного документа: получен / проверен / отклонён.
export const REVIEW_STATUSES = ['received', 'checked', 'rejected'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export function isReviewStatus(v: unknown): v is ReviewStatus {
  return typeof v === 'string' && (REVIEW_STATUSES as readonly string[]).includes(v)
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
