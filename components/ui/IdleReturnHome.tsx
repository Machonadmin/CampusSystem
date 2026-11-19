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
 * «Главный экран» — тот же, что после входа: landingRouteForRoles (для
 * управляющей кафедрой иудаики — дом иудаики). Признак рабочего пространства
 * спрашиваем у /api/education/workspace-nav; при любой ошибке — общий /dashboard.
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

async function fetchKodeshWorkspace(): Promise<boolean> {
  try {
    const res = await fetch('/api/education/workspace-nav')
    if (!res.ok) return false
    const data = await res.json() as { kodesh_workspace?: unknown }
    return data.kodesh_workspace === true
  } catch {
    return false
  }
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
    let checking = false

    const check = async (hiddenAt: number | null) => {
      if (hiddenAt === null || checking) return
      const from = pathRef.current
      const go = shouldReturnHome({
        awayMs: Date.now() - hiddenAt,
        pathname: from,
        isTouchDevice: isTouchDevice(),
        dialogOpen: document.querySelector('[aria-modal="true"]') !== null,
        editedOnScreen: edited.current,
      })
      if (!go) return
      checking = true
      const home = landingRouteForRoles(rolesRef.current, { kodeshWorkspace: await fetchKodeshWorkspace() })
      checking = false
      // Пока ждали ответ, человек мог уже перейти или начать вводить.
      if (pathRef.current !== from || edited.current) return
      if (from !== home) router.push(home)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        writeHiddenAt(Date.now())
        return
      }
      const hiddenAt = readHiddenAt()
      clearHiddenAt()
      void check(hiddenAt)
    }

    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      const hiddenAt = readHiddenAt()
      clearHiddenAt()
      void check(hiddenAt)
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
      if (wasRestoredFromBackground()) void check(hiddenAt)
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
