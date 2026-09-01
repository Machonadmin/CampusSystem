/**
 * Чистые нормализаторы для поиска дублей человека (см. /api/persons/duplicates).
 * Вынесены отдельно, чтобы покрыть тестами без БД.
 */

export interface NameParts {
  first_name?: string | null
  last_name?: string | null
  middle_name?: string | null
  full_name?: string | null
}

/** Нормализованное ФИО: нижний регистр, схлопнутые пробелы. Пусто → ''. */
export function normalizePersonName(p: NameParts): string {
  const parts = [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ') || p.full_name || ''
  return parts.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Нормализованный email: нижний регистр, обрезка. Пусто → ''. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').toLowerCase().trim()
}

/** Нормализованный паспорт/ת.ז: без пробелов, нижний регистр. Пусто → ''. */
export function normalizePassport(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, '').toLowerCase()
}

/**
 * Ключи для сравнения телефонов: последние 9 цифр каждого номера (устойчиво к
 * префиксам страны/0). Номера короче 7 цифр отбрасываем как ненадёжные.
 */
export function phoneMatchKeys(phones: unknown): string[] {
  if (!Array.isArray(phones)) return []
  const out: string[] = []
  for (const p of phones) {
    const num = (p && typeof p === 'object' && 'number' in p)
      ? String((p as { number: unknown }).number)
      : String(p)
    const d = num.replace(/\D/g, '')
    if (d.length >= 7) out.push(d.slice(-9))
  }
  return out
}
