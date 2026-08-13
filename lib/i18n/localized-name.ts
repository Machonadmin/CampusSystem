import type { Lang } from '@/lib/i18n/translations'

/**
 * Универсальное мультиязычное имя сущности-справочника (отдел, класс, семестр,
 * предмет, должность…). `name` — русское значение по умолчанию/резерв (персонал
 * русскоязычный); для he/en берём перевод, если он задан, иначе откат к `name`.
 */
export interface LocalizableName {
  name: string
  name_he?: string | null
  name_en?: string | null
}

export function localizedName(row: LocalizableName, lang: Lang): string {
  if (lang === 'he') return (row.name_he && row.name_he.trim()) || row.name
  if (lang === 'en') return (row.name_en && row.name_en.trim()) || row.name
  return row.name
}
