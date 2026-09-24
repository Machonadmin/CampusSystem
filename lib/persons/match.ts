import { createServerClient } from '@/lib/supabase/server'
import { normalizeEmail, normalizePersonName, phoneMatchKeys } from '@/lib/persons/duplicate-match'

type SB = ReturnType<typeof createServerClient>

/**
 * Решение №11: сопоставление контакта/донора с центральной персоной (persons).
 *
 * Правило владельца: связываем по ТЕЛЕФОНУ или EMAIL. Если нет уверенности, что
 * это тот же человек (имя отличается или кандидатов несколько) — спрашиваем
 * ответственного («возможное совпадение»). Совпадений нет — создаём персону.
 *
 * Нормализаторы — общие с поиском дублей (lib/persons/duplicate-match.ts);
 * поиск по телефону — тот же fetch-and-filter по phones JSONB, что в
 * app/api/persons/duplicates/route.ts.
 */

export interface MatchInput {
  name: string | null | undefined
  email: string | null | undefined
  phone: string | null | undefined
}

export interface PersonCandidateRow {
  id: string
  first_name: string | null
  last_name: string | null
  middle_name: string | null
  full_name: string | null
  hebrew_name: string | null
  email: string | null
  phones: unknown
}

export interface PersonCandidate extends PersonCandidateRow {
  matched_email: boolean
  matched_phone: boolean
}

export type MatchClassification =
  | { kind: 'none' }
  | { kind: 'linked'; person_id: string }
  | { kind: 'suggested'; person_id: string }

const CANDIDATE_COLS = 'id, first_name, last_name, middle_name, full_name, hebrew_name, email, phones'

/** Ключ телефона записи (последние 9 цифр) или null, если номера нет/он ненадёжен. */
export function recordPhoneKey(phone: string | null | undefined): string | null {
  return phoneMatchKeys(phone ? [phone] : [])[0] ?? null
}

/** Экранирует спецсимволы шаблона ILIKE (%, _, \), чтобы искать email буквально. */
export function escapeIlike(v: string): string {
  return v.replace(/[\\%_]/g, m => `\\${m}`)
}

/** Отсортированные токены нормализованного имени — сравнение без учёта порядка слов. */
function nameTokens(normalized: string): string {
  return normalized.split(' ').filter(Boolean).sort().join(' ')
}

/**
 * Совпадает ли имя записи с именем персоны. Сравнение нормализованное
 * (normalizePersonName: регистр/пробелы) и НЕ зависит от порядка слов
 * («Иван Петров» = «Петров Иван» — в persons full_name хранится как
 * «фамилия имя отчество»). Сверяется и с hebrew_name персоны.
 */
export function namesMatch(recordName: string | null | undefined, person: PersonCandidateRow): boolean {
  const rec = normalizePersonName({ full_name: recordName ?? '' })
  if (!rec) return false
  const recTokens = nameTokens(rec)
  const personNames = [
    normalizePersonName(person),
    normalizePersonName({ full_name: person.full_name ?? '' }),
    normalizePersonName({ full_name: person.hebrew_name ?? '' }),
  ].filter(Boolean)
  return personNames.some(n => n === rec || nameTokens(n) === recTokens)
}

/**
 * Классификация (чистая функция):
 *   • нет кандидатов                                  → 'none' (создать персону);
 *   • ровно 1 кандидат (по телефону/email) + имя совпало → 'linked';
 *   • совпадение есть, но имя отличается ИЛИ кандидатов >1 → 'suggested'
 *     (лучший кандидат: сначала совпавшее имя, затем совпали и телефон, и email).
 */
export function classifyPersonMatch(input: MatchInput, candidates: PersonCandidate[]): MatchClassification {
  if (candidates.length === 0) return { kind: 'none' }
  if (candidates.length === 1) {
    const only = candidates[0]
    return namesMatch(input.name, only)
      ? { kind: 'linked', person_id: only.id }
      : { kind: 'suggested', person_id: only.id }
  }
  const score = (c: PersonCandidate) =>
    (namesMatch(input.name, c) ? 4 : 0) + (c.matched_email && c.matched_phone ? 2 : 0)
  const best = candidates
    .map((c, i) => ({ c, i, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)[0].c
  return { kind: 'suggested', person_id: best.id }
}

/**
 * Кандидаты в persons по email (без учёта регистра) и/или телефону
 * (последние 9 цифр). Ошибка БД пробрасывается ({ error }) — вызывающий
 * (best-effort) решает, что делать.
 */
export async function findPersonCandidates(
  sb: SB,
  input: MatchInput,
): Promise<{ candidates: PersonCandidate[]; error: { code?: string; message?: string } | null }> {
  const email = normalizeEmail(input.email)
  const phoneKey = recordPhoneKey(input.phone)
  const byId = new Map<string, PersonCandidate>()

  const upsert = (r: PersonCandidateRow, by: 'email' | 'phone') => {
    const cur = byId.get(r.id) ?? { ...r, matched_email: false, matched_phone: false }
    if (by === 'email') cur.matched_email = true
    else cur.matched_phone = true
    byId.set(r.id, cur)
  }

  if (email) {
    const { data, error } = await sb
      .from('persons')
      .select(CANDIDATE_COLS)
      .ilike('email', escapeIlike(email))
      .limit(50)
    if (error) return { candidates: [], error }
    for (const r of (data ?? []) as unknown as PersonCandidateRow[]) {
      if (normalizeEmail(r.email) === email) upsert(r, 'email')
    }
  }

  if (phoneKey) {
    // Тот же приём, что в /api/persons/duplicates: phones — JSONB-массив
    // произвольного формата, поэтому фильтруем в приложении.
    const { data, error } = await sb
      .from('persons')
      .select(CANDIDATE_COLS)
      .limit(20000)
    if (error) return { candidates: [], error }
    for (const r of (data ?? []) as unknown as PersonCandidateRow[]) {
      if (phoneMatchKeys(r.phones).includes(phoneKey)) upsert(r, 'phone')
    }
  }

  return { candidates: [...byId.values()], error: null }
}
