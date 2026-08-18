import type { Lang } from '@/lib/i18n/translations'

/** Мультиязычное имя справочника (направление/уровень): name_ru — по умолчанию. */
export interface RefNames { name_ru: string; name_he?: string | null; name_en?: string | null }

/**
 * Имя направления/уровня на нужном языке. Русское `name_ru` — значение по
 * умолчанию; для he/en берём перевод, если задан, иначе откат к русскому.
 */
export function localizedRefName(r: RefNames, lang: Lang): string {
  if (lang === 'he') return (r.name_he && r.name_he.trim()) || r.name_ru
  if (lang === 'en') return (r.name_en && r.name_en.trim()) || r.name_ru
  return r.name_ru
}
