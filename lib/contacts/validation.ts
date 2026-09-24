// ─── Валидация ввода модуля «Контакты» ──────────────────────────────────────
//
// Держим type-guards здесь, чтобы 400 (кривой ввод) возвращался ДО обращения к
// БД, а не долетал до CHECK-колонки и падал 23514 → 500 более общим текстом.
// Зеркалит lib/documents/validation.ts. Email валидируется чистой isValidEmail
// из lib/contacts/directory.ts.

export const CONTACT_TYPES = ['organization', 'person'] as const
export type ContactType = (typeof CONTACT_TYPES)[number]

export function isContactType(v: unknown): v is ContactType {
  return typeof v === 'string' && (CONTACT_TYPES as readonly string[]).includes(v)
}

export const CONTACT_CATEGORIES = [
  'supplier', 'government', 'partner', 'emergency',
  'medical', 'financial', 'education', 'other',
] as const
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number]

export function isContactCategory(v: unknown): v is ContactCategory {
  return typeof v === 'string' && (CONTACT_CATEGORIES as readonly string[]).includes(v)
}
