/**
 * Разбор и нормализация полей формы выпускницы (создание вручную и правка).
 * Чистые функции: одинаково используются POST /api/alumni и
 * PATCH /api/alumni/journeys/[journeyId], покрыты тестами.
 *
 * Поля делятся на две группы:
 *   person  — persons (ФИО, еврейское имя, дата рождения, контакты, адрес);
 *   profile — alumni_profiles (год выпуска, рамка, программа, сейчас, заметки).
 * В результат попадают ТОЛЬКО поля, присутствующие во входе: так PATCH
 * меняет лишь то, что прислали, и не затирает остальное.
 */

export interface AlumniInput {
  first_name?: unknown
  last_name?: unknown
  middle_name?: unknown
  hebrew_name?: unknown
  birth_date?: unknown
  email?: unknown
  phones?: unknown
  country?: unknown
  city?: unknown
  graduation_year?: unknown
  institution?: unknown
  direction?: unknown
  current_location?: unknown
  current_occupation?: unknown
  notes?: unknown
}

export interface PersonPatch {
  first_name?: string
  last_name?: string | null
  middle_name?: string | null
  hebrew_name?: string | null
  birth_date?: string | null
  email?: string | null
  phones?: { type: string; number: string }[]
}

export interface AddressPatch {
  country?: string | null
  city?: string | null
}

export interface ProfilePatch {
  graduation_year?: number | null
  institution?: string | null
  direction?: string | null
  current_location?: string | null
  current_occupation?: string | null
  notes?: string | null
}

export type ParseResult =
  | { ok: true; person: PersonPatch; address: AddressPatch | null; profile: ProfilePatch }
  | { ok: false; error: 'name_required' | 'invalid_date' | 'invalid_year' | 'invalid_email' }

function text(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** Телефоны: массив строк или одна строка через запятую/«;» → [{type,number}]. */
export function parsePhones(v: unknown): { type: string; number: string }[] {
  const raw: unknown[] = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\n]/) : []
  const out: { type: string; number: string }[] = []
  for (const r of raw) {
    const n = typeof r === 'string' ? r.trim()
      : (r && typeof r === 'object' && typeof (r as { number?: unknown }).number === 'string')
        ? ((r as { number: string }).number).trim() : ''
    if (n && !out.some(p => p.number === n)) out.push({ type: 'mobile', number: n })
  }
  return out
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

/**
 * @param mode 'create' — имя обязательно; 'update' — поля необязательны,
 *             но если first_name прислан, он не может быть пустым.
 */
export function parseAlumniInput(body: AlumniInput, mode: 'create' | 'update'): ParseResult {
  const b = (body && typeof body === 'object') ? body : {}
  const person: PersonPatch = {}
  const profile: ProfilePatch = {}
  let address: AddressPatch | null = null

  if (mode === 'create' || has(b, 'first_name')) {
    const first = text(b.first_name)
    if (!first) return { ok: false, error: 'name_required' }
    person.first_name = first
  }
  for (const k of ['last_name', 'middle_name', 'hebrew_name'] as const) {
    if (has(b, k)) person[k] = text(b[k])
  }
  if (has(b, 'email')) {
    const e = text(b.email)
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: 'invalid_email' }
    person.email = e
  }
  if (has(b, 'birth_date')) {
    const d = text(b.birth_date)
    if (d) {
      const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      const dt = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null
      if (!m || !dt || dt.getUTCMonth() !== +m[2] - 1 || dt.getUTCDate() !== +m[3]) {
        return { ok: false, error: 'invalid_date' }
      }
    }
    person.birth_date = d
  }
  if (has(b, 'phones')) person.phones = parsePhones(b.phones)

  if (has(b, 'country') || has(b, 'city')) {
    address = {}
    if (has(b, 'country')) address.country = text(b.country)
    if (has(b, 'city')) address.city = text(b.city)
  }

  if (has(b, 'graduation_year')) {
    const y = text(b.graduation_year)
    if (y == null) profile.graduation_year = null
    else {
      const n = Number(y)
      if (!Number.isInteger(n) || n < 1900 || n > 2100) return { ok: false, error: 'invalid_year' }
      profile.graduation_year = n
    }
  }
  for (const k of ['institution', 'direction', 'current_location', 'current_occupation', 'notes'] as const) {
    if (has(b, k)) profile[k] = text(b[k])
  }

  return { ok: true, person, address, profile }
}

/** Слить правку адреса с текущим адресом (другие ключи — улица и т.п. — сохраняются). */
export function mergeAddress(current: unknown, patch: AddressPatch): Record<string, unknown> | null {
  const base = (current && typeof current === 'object' && !Array.isArray(current))
    ? { ...(current as Record<string, unknown>) } : {}
  for (const [k, v] of Object.entries(patch)) {
    if (v == null) delete base[k]
    else base[k] = v
  }
  return Object.values(base).some(v => v != null && v !== '') ? base : null
}
