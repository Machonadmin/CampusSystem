import type { Lang } from '@/lib/i18n/translations'

/** Мультиязычное имя подразделения: RU (`name`) — по умолчанию, he/en — если заданы. */
export interface DeptNames { name: string; name_he?: string | null; name_en?: string | null }

/**
 * Возвращает название подразделения на нужном языке. Русское `name` — значение
 * по умолчанию (персонал русскоязычный); для he/en берём перевод, если он есть,
 * иначе откатываемся к русскому.
 */
export function localizedDeptName(d: DeptNames, lang: Lang): string {
  if (lang === 'he') return (d.name_he && d.name_he.trim()) || d.name
  if (lang === 'en') return (d.name_en && d.name_en.trim()) || d.name
  return d.name
}
