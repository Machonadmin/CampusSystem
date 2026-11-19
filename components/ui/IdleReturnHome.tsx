'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { landingRouteForRoles } from '@/lib/auth/landing'
import { HIDDEN_AT_KEY, parseHiddenAt, shouldReturnHome } from '@/lib/nav/idle-return-home'

/**
 * Возврат на главный экран после часа в фоне (правила — lib/nav/idle-return-home.ts).
 *
 * Момент ухода в фон пишется в sessionStorage: он переживает и обычное
 * возвращение (visibilitychange → visible), и вкладку, которую браузер выгрузил
 * из памяти и перезагрузил при возвращении (document.wasDiscarded / reload).
 * Обычный переход по ссылке (например, из пуш-уведомления) НЕ перехватываем —
 * человек открыл конкретную страницу.
 *
 * «Главный экран» — тот же, что после входа: landingRouteForRoles, то есть
 * общий /dashboard для всех (с 19.11.2026 «מרחב יהדות» — обычный модуль меню,
 * а не отдельный «дом»).
 */

function readHiddenAt(): number | null {
  try { return parseHiddenAt(window.sessionStorage.getItem(HIDDEN_AT_KEY)) } catch { return null }
}

function writeHiddenAt(at: number): void {
  try { window.sessionStorage.setItem(HIDDEN_AT_KEY, String(at)) } catch { /* хранилище недоступно */ }
}

function clearHiddenAt(): void {
  try { window.sessionStorage.removeItem(HIDDEN_AT_KEY) } catch { /* хранилище недоступно */ }
}

function isTouchDevice(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: none) and (pointer: coarse)').matches
}

function wasRestoredFromBackground(): boolean {
  if ((document as Document & { wasDiscarded?: boolean }).wasDiscarded === true) return true
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return nav?.type === 'reload' || nav?.type === 'back_forward'
}

export default function IdleReturnHome({ roles }: { roles: string[] }) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const pathRef = useRef(pathname)
  const edited = useRef(false)
  const rolesRef = useRef(roles)
  useEffect(() => { rolesRef.current = roles }, [roles])

  // Новый экран — «ничего не вводили» заново.
  useEffect(() => {
    pathRef.current = pathname
    edited.current = false
  }, [pathname])

  useEffect(() => {
    const check = (hiddenAt: number | null) => {
      if (hiddenAt === null) return
      const from = pathRef.current
      const go = shouldReturnHome({
        awayMs: Date.now() - hiddenAt,
        pathname: from,
        isTouchDevice: isTouchDevice(),
        dialogOpen: document.querySelector('[aria-modal="true"]') !== null,
        editedOnScreen: edited.current,
      })
      if (!go) return
      const home = landingRouteForRoles(rolesRef.current)
      if (from !== home) router.push(home)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        writeHiddenAt(Date.now())
        return
      }
      const hiddenAt = readHiddenAt()
      clearHiddenAt()
      check(hiddenAt)
    }

    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      const hiddenAt = readHiddenAt()
      clearHiddenAt()
      check(hiddenAt)
    }

    const onEdit = (e: Event) => {
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement
        || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable)) {
        edited.current = true
      }
    }

    // Первый показ документа: вкладка, выгруженная из памяти, возвращается
    // перезагрузкой — проверяем по метке, оставленной до выгрузки.
    if (document.visibilityState === 'hidden') {
      if (readHiddenAt() === null) writeHiddenAt(Date.now())
    } else {
      const hiddenAt = readHiddenAt()
      clearHiddenAt()
      if (wasRestoredFromBackground()) check(hiddenAt)
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('input', onEdit, true)
    document.addEventListener('change', onEdit, true)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('input', onEdit, true)
      document.removeEventListener('change', onEdit, true)
    }
  }, [router])

  return null
}
