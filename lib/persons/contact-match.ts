import type { createServerClient } from '@/lib/supabase/server'
import { normalizeEmail, normalizePersonName, phoneMatchKeys } from '@/lib/persons/duplicate-match'

/**
 * Поиск существующей персоны по контактам при регистрации лида (решение
 * владельца 24.09.2026): совпадение ТЕЛЕФОНА или EMAIL → вливаем заявку в
 * существующую карточку; совпадение только по ИМЕНИ → не сливаем, лишь
 * помечаем «возможный дубль» для сотрудниц.
 *
 * Чистая логика сравнения вынесена в экспортируемые функции (покрыта тестами),
 * обёртки с БД — ниже. Колонки «удалён/архив» у persons нет — фильтровать нечего.
 */

type Sb = ReturnType<typeof createServerClient>

export interface ContactQuery {
  phones: string[]
  email: string | null
}

export interface ContactRow {
  id: string
  phones: unknown
  email: string | null
}

export interface NameRow {
  id: string
  first_name: string | null
  last_name: string | null
}

/** Тот же предел скана, что и в /api/persons/duplicates. */
const SCAN_LIMIT = 20000

/**
 * Чистая проверка: совпадает ли строка персоны с контактами заявки —
 * нормализованный email ИЛИ пересечение ключей телефонов (последние 9 цифр).
 */
export function matchesContact(row: ContactRow, q: ContactQuery): boolean {
  const email = normalizeEmail(q.email)
  if (email && normalizeEmail(row.email) === email) return true
  const wanted = new Set(phoneMatchKeys(q.phones))
  if (wanted.size === 0) return false
  return phoneMatchKeys(row.phones).some(k => wanted.has(k))
}

/** Чистый фильтр: id всех строк, совпавших по контакту (без повторов). */
export function filterByContact(rows: ContactRow[], q: ContactQuery): string[] {
  const out: string[] = []
  for (const r of rows) {
    if (!out.includes(r.id) && matchesContact(r, q)) out.push(r.id)
  }
  return out
}

/** Ключ имени для сравнения «только по имени»: фамилия + имя (без отчества). */
export function nameKey(first: string | null | undefined, last: string | null | undefined): string {
  return normalizePersonName({ first_name: first ?? null, last_name: last ?? null })
}

/** Чистый фильтр: id строк с тем же именем+фамилией. Пустое имя → []. */
export function filterByName(rows: NameRow[], first: string | null | undefined, last: string | null | undefined): string[] {
  // Без фамилии совпадение одного имени слишком частое — не помечаем.
  if (!first?.trim() || !last?.trim()) return []
  const key = nameKey(first, last)
  return rows.filter(r => nameKey(r.first_name, r.last_name) === key).map(r => r.id)
}

/** Персоны, совпавшие с заявкой по телефону или email. */
export async function findPersonsByContact(sb: Sb, q: ContactQuery): Promise<string[]> {
  const hasEmail = !!normalizeEmail(q.email)
  const hasPhone = phoneMatchKeys(q.phones).length > 0
  if (!hasEmail && !hasPhone) return []
  // Телефоны лежат в JSONB в разных форматах (строки/объекты, с префиксами),
  // поэтому сравниваем в коде по ключам, а не SQL-фильтром.
  const { data, error } = await sb
    .from('persons')
    .select('id, phones, email')
    .limit(SCAN_LIMIT)
  if (error) throw error
  return filterByContact((data ?? []) as ContactRow[], q)
}

/** Экранирует спецсимволы шаблона ILIKE (%, _, \). */
function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, m => `\\${m}`)
}

/** Персоны с тем же именем и фамилией (для пометки «возможный дубль»). */
export async function findPersonsByName(sb: Sb, first: string | null | undefined, last: string | null | undefined): Promise<string[]> {
  if (!first?.trim() || !last?.trim()) return []
  // Сужаем выборку по имени (ILIKE без учёта регистра), точное сравнение — в коде.
  const { data, error } = await sb
    .from('persons')
    .select('id, first_name, last_name')
    .ilike('first_name', `%${escapeLike(first.trim())}%`)
    .limit(500)
  if (error) throw error
  return filterByName((data ?? []) as NameRow[], first, last)
}
