// Телефоны персоны хранятся как JSONB-массив объектов [{type, number}]. Раньше
// местами писались/читались голые строки, поэтому эти хелперы принимают ОБА
// вида (объект И строку) и всегда возвращают строку/массив строк — чтобы
// объект телефона НИКОГДА не попал прямо в JSX (React error #31).

function numberOf(p: unknown): string | null {
  if (p == null) return null
  if (typeof p === 'string') return p.trim() || null
  if (typeof p === 'object') {
    const n = (p as { number?: unknown }).number
    return typeof n === 'string' ? (n.trim() || null) : null
  }
  return null
}

/** Первый номер телефона строкой (или null). Принимает string|object элементы. */
export function firstPhone(phones: unknown): string | null {
  if (!Array.isArray(phones)) return null
  for (const p of phones) {
    const n = numberOf(p)
    if (n) return n
  }
  return null
}

/** Все номера телефонов как массив строк. */
export function phoneList(phones: unknown): string[] {
  if (!Array.isArray(phones)) return []
  return phones.map(numberOf).filter((n): n is string => !!n)
}
