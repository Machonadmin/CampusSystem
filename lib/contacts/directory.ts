// ─── Контакты: поиск, валидация email и агрегаты справочника — чистая логика ──
//
// Никаких обращений к БД — логика детерминирована и целиком покрывается
// юнит-тестами (directory.test.ts, vitest). Модуль НЕ привязан к студентам:
// это самостоятельный справочник внешних контактов и организаций.

/** Минимальная форма контакта для app-side поиска. */
export interface ContactSearchable {
  name: string
  email: string | null
  phone: string | null
  contact_person: string | null
  category: string
}

/** Минимальная форма контакта для агрегатов. */
export interface ContactStatLike {
  contact_type: string
  category: string
  is_active: boolean
}

/**
 * Простая здравая проверка email: непустой, без пробельных символов, ровно
 * один @ с непустой локальной частью, домен содержит точку, все метки домена
 * непустые (отсекает точку с краю и двойные точки: a@.b.com, a@b..com).
 * Сознательно НЕ полная RFC-валидация — цель отсечь пустое и явно кривое,
 * возвращая 400 до записи в БД.
 */
export function isValidEmail(s: string): boolean {
  if (!s) return false
  if (/\s/.test(s)) return false
  const at = s.indexOf('@')
  if (at <= 0) return false                    // нет @ или пустая локальная часть
  if (at !== s.lastIndexOf('@')) return false  // больше одного @
  const labels = s.slice(at + 1).split('.')
  if (labels.length < 2) return false          // в домене нет точки
  return labels.every(l => l.length > 0)       // точка не с краю, без пустых меток
}

/**
 * Case-insensitive поиск подстроки по имени, email, телефону, контактному лицу
 * и категории. Пустой (или пробельный) запрос совпадает со всеми.
 */
export function matchesSearch(c: ContactSearchable, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [c.name, c.email ?? '', c.phone ?? '', c.contact_person ?? '', c.category]
    .some(f => f.toLowerCase().includes(needle))
}

export interface ContactStats {
  total: number
  active: number
  by_type: Record<string, number>
  by_category: Record<string, number>
}

/**
 * Агрегаты по справочнику: всего / активных, разбивки по типу и категории.
 * Разбивки включают ВСЕ контакты (и неактивные) — активность отражается
 * счётчиком active.
 */
export function contactStats(contacts: ContactStatLike[]): ContactStats {
  let active = 0
  const byType: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  for (const c of contacts) {
    if (c.is_active) active++
    byType[c.contact_type] = (byType[c.contact_type] ?? 0) + 1
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1
  }
  return { total: contacts.length, active, by_type: byType, by_category: byCategory }
}
