import { cookies } from 'next/headers'
import type { Lang } from './translations'

/**
 * Язык из cookie `campus_locale`. Без cookie (выбора ещё не было) — `fallback`:
 * по умолчанию 'ru' (персонал русскоязычный), но публичная страница /apply
 * передаёт 'he' — новая посетительница сайта видит иврит, а не русский.
 */
export function getCookieLocale(fallback: Lang = 'ru'): Lang {
  const cookieStore = cookies()
  const value = cookieStore.get('campus_locale')?.value
  if (value === 'ru' || value === 'he' || value === 'en') return value
  return fallback
}
