'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { recordInAppNavigation } from '@/lib/hooks/useSafeBack'

/**
 * Считает переходы внутри приложения для кнопки «חזרה» (см. canGoBackInApp).
 * Первый показ страницы не считается; смена адреса после popstate («назад»/«вперёд»
 * браузера) уменьшает глубину, остальные — увеличивают.
 */
export default function InAppNavTracker() {
  const pathname = usePathname()
  const search = useSearchParams()?.toString() ?? ''
  const first = useRef(true)
  const popped = useRef(false)

  useEffect(() => {
    const onPop = () => { popped.current = true }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (first.current) { first.current = false; return }
    recordInAppNavigation(popped.current ? 'pop' : 'push')
    popped.current = false
  }, [pathname, search])

  return null
}
