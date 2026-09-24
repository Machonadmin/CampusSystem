'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { parseTabParam, buildTabQuery } from './url-tab'

/**
 * Хук: активная вкладка верхнего уровня, адресуемая через URL (?tab= по
 * умолчанию). Возвращает [active, setTab]. setTab делает router.push — каждый
 * переход это запись истории, поэтому «назад» шагает по вкладкам, а deep-link/
 * обновление восстанавливают вкладку. Прочие query-параметры сохраняются.
 */
export function useUrlTab<T extends string>(opts: {
  allowed: readonly T[]
  fallback: T
  key?: string
  aliases?: Readonly<Record<string, T>>
}): [T, (next: T) => void] {
  const { allowed, fallback, key = 'tab', aliases } = opts
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const active = parseTabParam(searchParams.get(key), allowed, fallback, aliases)

  const setTab = useCallback((next: T) => {
    const qs = buildTabQuery(new URLSearchParams(searchParams.toString()), key, next, fallback)
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }, [router, pathname, searchParams, key, fallback])

  return [active, setTab]
}
