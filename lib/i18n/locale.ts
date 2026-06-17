import { cookies } from 'next/headers'
import type { Lang } from './translations'

export function getCookieLocale(): Lang {
  const cookieStore = cookies()
  const value = cookieStore.get('campus_locale')?.value
  if (value === 'ru' || value === 'he' || value === 'en') return value
  return 'ru'
}
