import { cookies, type UnsafeUnwrappedCookies } from 'next/headers'
import type { Lang } from './translations'

// Next 15 сделал cookies() асинхронным, но синхронный доступ пока работает
// (в dev — с предупреждением). getCookieLocale синхронный и вызывается из
// сотен мест (serverT и др.); перевод всей цепочки на async — отдельная работа
// перед переходом на Next 16, где синхронный доступ убран.
export function getCookieLocale(): Lang {
  const cookieStore = cookies() as unknown as UnsafeUnwrappedCookies
  const value = cookieStore.get('campus_locale')?.value
  if (value === 'ru' || value === 'he' || value === 'en') return value
  return 'ru'
}
