// ─── ספר אנשי הקשר של המנהל — чистые правила ────────────────────────────────
//
// Кто что видит (запрос клиента 16.11.2026):
//   • המנהל (superadmin или владелец календаря с секретарём) — все группы,
//     встречи с человеком в своём календаре; заметки, семейные данные и
//     пожертвования — только superadmin.
//   • מזכירת המנהל (ведёт чужой календарь) — все группы, но ТОЛЬКО технические
//     данные: имя, телефон, email, фото, подразделение, группа, год, מסלול, город.
//   • личный контакт видит его владелец и те, с кем он поделился (без заметок).

export const CONTACT_GROUPS = ['students', 'staff', 'alumni', 'donors', 'private'] as const
export type ContactGroup = typeof CONTACT_GROUPS[number]

export const CONTACT_KINDS = ['person', 'sponsor', 'private'] as const
export type ContactKind = typeof CONTACT_KINDS[number]

export type AddressBookRole = 'director' | 'secretary'

export function isContactGroup(v: unknown): v is ContactGroup {
  return typeof v === 'string' && (CONTACT_GROUPS as readonly string[]).includes(v)
}
export function isContactKind(v: unknown): v is ContactKind {
  return typeof v === 'string' && (CONTACT_KINDS as readonly string[]).includes(v)
}

export function addressBookRole(a: { isSuperadmin: boolean; hasDelegates: boolean; managesOthers: boolean }): AddressBookRole | null {
  if (a.isSuperadmin || a.hasDelegates) return 'director'
  if (a.managesOthers) return 'secretary'
  return null
}

/** Какие группы открыты: с ролью — все; без роли, но с расшаренными — только личные. */
export function groupsFor(role: AddressBookRole | null, sharedWithMe: number): ContactGroup[] {
  if (role) return [...CONTACT_GROUPS]
  return sharedWithMe > 0 ? ['private'] : []
}

/** Что из чувствительного открыто (заметки, семья, пожертвования, встречи). */
export function sensitiveAccess(role: AddressBookRole | null, isSuperadmin: boolean): { meetings: boolean; notes: boolean } {
  return { meetings: role === 'director', notes: role === 'director' && isSuperadmin }
}

/** Отношение к личному контакту. */
export function privateAccess(ownerId: string, personId: string, sharedWith: readonly string[]): 'owner' | 'shared' | null {
  if (ownerId === personId) return 'owner'
  return sharedWith.includes(personId) ? 'shared' : null
}

// ── Ввод ────────────────────────────────────────────────────────────────────

const LIMITS = {
  name: 200, phone: 40, email: 200, city: 120, organization: 200, role_title: 200, category: 80, notes: 4000,
} as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(v: unknown, max: number): string | null | undefined {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (s.length > max) return undefined
  return s === '' ? null : s
}

export interface TechPatch { name?: string; phone?: string | null; email?: string | null; city?: string | null }

/**
 * Технические поля, которые правит и секретарь. Только переданные ключи.
 * Ошибка — имя пустое/длинное, email не похож на email, не строка.
 */
export function cleanTechPatch(body: Record<string, unknown>): { ok: true; patch: TechPatch } | { ok: false } {
  const patch: TechPatch = {}
  if ('name' in body) {
    const n = text(body.name, LIMITS.name)
    if (!n) return { ok: false }
    patch.name = n
  }
  for (const k of ['phone', 'email', 'city'] as const) {
    if (!(k in body)) continue
    const v = text(body[k], LIMITS[k])
    if (v === undefined) return { ok: false }
    if (k === 'email' && v && !EMAIL_RE.test(v)) return { ok: false }
    patch[k] = v
  }
  return { ok: true, patch }
}

export interface PrivateContactInput {
  full_name: string
  phone: string | null
  email: string | null
  city: string | null
  organization: string | null
  role_title: string | null
  category: string | null
  notes: string | null
}

const PRIVATE_FIELDS = ['phone', 'email', 'city', 'organization', 'role_title', 'category', 'notes'] as const

/** Личный контакт целиком (создание / импорт). null — строка негодна. */
export function cleanPrivateContact(raw: unknown): PrivateContactInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const full_name = text(r.full_name, LIMITS.name)
  if (!full_name) return null
  const out: PrivateContactInput = {
    full_name, phone: null, email: null, city: null, organization: null, role_title: null, category: null, notes: null,
  }
  for (const k of PRIVATE_FIELDS) {
    const v = text(r[k], LIMITS[k])
    if (v === undefined) return null
    out[k] = v
  }
  // Кривой email при импорте не валит строку — просто не сохраняем его.
  if (out.email && !EMAIL_RE.test(out.email)) out.email = null
  return out
}

/** Частичное изменение личного контакта (владелец). */
export function cleanPrivatePatch(body: Record<string, unknown>): { ok: true; patch: Partial<PrivateContactInput> } | { ok: false } {
  const patch: Partial<PrivateContactInput> = {}
  if ('full_name' in body) {
    const n = text(body.full_name, LIMITS.name)
    if (!n) return { ok: false }
    patch.full_name = n
  }
  for (const k of PRIVATE_FIELDS) {
    if (!(k in body)) continue
    const v = text(body[k], LIMITS[k])
    if (v === undefined) return { ok: false }
    if (k === 'email' && v && !EMAIL_RE.test(v)) return { ok: false }
    patch[k] = v
  }
  return { ok: true, patch }
}

/** Телефоны персоны: заменить первый номер, остальные сохранить. */
export function replaceFirstPhone(phones: unknown, phone: string | null): unknown[] {
  const list = Array.isArray(phones) ? [...phones] : []
  if (phone === null) return list.slice(1)
  const entry = { type: 'mobile', number: phone }
  if (list.length === 0) return [entry]
  const first = list[0]
  list[0] = first && typeof first === 'object' ? { ...(first as object), number: phone } : entry
  return list
}

// ── Импорт из таблицы (CSV из Google Sheets / Excel) ────────────────────────

const HEADER_ALIASES: Record<string, keyof PrivateContactInput | 'first_name' | 'last_name'> = {
  'name': 'full_name', 'full name': 'full_name', 'שם': 'full_name', 'שם מלא': 'full_name', 'имя': 'full_name', 'фио': 'full_name',
  'first name': 'first_name', 'שם פרטי': 'first_name',
  'last name': 'last_name', 'שם משפחה': 'last_name', 'фамилия': 'last_name',
  'phone': 'phone', 'mobile': 'phone', 'טלפון': 'phone', 'נייד': 'phone', 'פלאפון': 'phone', 'телефон': 'phone',
  'email': 'email', 'e-mail': 'email', 'mail': 'email', 'מייל': 'email', 'אימייל': 'email', 'דוא"ל': 'email', 'דואל': 'email', 'почта': 'email',
  'city': 'city', 'עיר': 'city', 'מקום מגורים': 'city', 'город': 'city',
  'organization': 'organization', 'company': 'organization', 'ארגון': 'organization', 'מוסד': 'organization', 'חברה': 'organization', 'организация': 'organization',
  'role': 'role_title', 'title': 'role_title', 'תפקיד': 'role_title', 'должность': 'role_title',
  'group': 'category', 'category': 'category', 'קבוצה': 'category', 'קטגוריה': 'category', 'סוג': 'category', 'группа': 'category',
  'notes': 'notes', 'note': 'notes', 'הערות': 'notes', 'הערה': 'notes', 'заметки': 'notes', 'примечание': 'notes',
}

/** Разбор CSV/TSV с кавычками; разделитель — по первой строке (таб, ; или ,). */
export function parseCsv(input: string): string[][] {
  const s = input.replace(/^﻿/, '')
  const firstLine = s.split(/\r?\n/, 1)[0] ?? ''
  const sep = firstLine.includes('\t') ? '\t' : (firstLine.split(';').length > firstLine.split(',').length ? ';' : ',')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += c
      continue
    }
    if (c === '"' && cell === '') quoted = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(x => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some(x => x.trim() !== '')) rows.push(row)
  return rows
}

/**
 * Таблица контактов → строки для импорта. Первая строка — заголовки
 * (иврит / английский / русский). Без колонки имени — ничего не импортируем.
 */
export function contactsFromTable(table: string[][]): { rows: PrivateContactInput[]; skipped: number; recognized: boolean } {
  if (table.length === 0) return { rows: [], skipped: 0, recognized: false }
  const cols = table[0].map(h => HEADER_ALIASES[h.trim().toLowerCase()] ?? HEADER_ALIASES[h.trim()] ?? null)
  const hasName = cols.includes('full_name') || cols.includes('first_name') || cols.includes('last_name')
  if (!hasName) return { rows: [], skipped: Math.max(0, table.length - 1), recognized: false }
  const rows: PrivateContactInput[] = []
  let skipped = 0
  for (const line of table.slice(1)) {
    const r: Record<string, string> = {}
    cols.forEach((k, i) => {
      if (!k) return
      const v = (line[i] ?? '').trim()
      if (v) r[k] = r[k] ? `${r[k]} ${v}` : v
    })
    if (!r.full_name) r.full_name = [r.first_name, r.last_name].filter(Boolean).join(' ')
    const c = cleanPrivateContact(r)
    if (c) rows.push(c)
    else skipped++
  }
  return { rows, skipped, recognized: true }
}

export const MAX_IMPORT_ROWS = 2000
