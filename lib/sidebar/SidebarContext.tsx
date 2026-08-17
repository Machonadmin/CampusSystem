'use client'

import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'

// useLayoutEffect применяет коррекцию мобильного оффсета ДО отрисовки (без
// «прыжка» с десктопной раскладки), но на сервере его нет — используем useEffect.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

interface SidebarCtx {
  isOpen: boolean
  isPinned: boolean
  isMobile: boolean
  toggle: () => void
  close: () => void
  setPin: (v: boolean) => void
}

const SidebarContext = createContext<SidebarCtx>({
  isOpen: true,
  isPinned: true,
  isMobile: false,
  toggle: () => {},
  close: () => {},
  setPin: () => {},
})

// Авто-сворачивание сайдбара в «Образовании» ОТКЛЮЧЕНО (запрос владельца): теперь
// набор/приём/учёба — три отдельных пункта в самом сайдбаре, поэтому рейл должен
// оставаться раскрытым, иначе их названий не видно.
function isDenseRoute(_pathname: string | null): boolean {
  return false
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const dense = isDenseRoute(pathname)

  // userOpen — глобальное предпочтение (персистится). eduOpen — временное
  // состояние ВНУТРИ «Образования» (по умолчанию свёрнут; можно временно
  // развернуть, при повторном входе снова свёрнут). Не персистится.
  const [userOpen, setUserOpen] = useState(true)
  const [eduOpen, setEduOpen] = useState(false)
  const [isPinned, setIsPinned] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useIsoLayoutEffect(() => {
    const mobile = window.innerWidth < 768
    setIsMobile(mobile)
    if (mobile) {
      setUserOpen(false)
      setIsPinned(false)
    } else {
      const savedOpen = localStorage.getItem('sidebar_open')
      const savedPin = localStorage.getItem('sidebar_pinned')
      if (savedOpen !== null) setUserOpen(savedOpen === 'true')
      if (savedPin !== null) setIsPinned(savedPin === 'true')
    }

    function onResize() {
      const m = window.innerWidth < 768
      setIsMobile(m)
      if (m) setUserOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // При каждом ВХОДЕ в плотный маршрут — свернуть (без персиста). Навигация
  // между под-страницами «Образования» сюда не попадает (dense не меняется),
  // поэтому ручное разворачивание внутри модуля сохраняется.
  useEffect(() => { if (dense) setEduOpen(false) }, [dense])

  // Эффективное состояние: на мобиле всегда свёрнут; в «Образовании» — eduOpen;
  // иначе — глобальное предпочтение.
  const isOpen = isMobile ? false : (dense ? eduOpen : userOpen)

  const toggle = useCallback(() => {
    if (dense) { setEduOpen(v => !v); return }
    setUserOpen(v => {
      const next = !v
      if (window.innerWidth >= 768) localStorage.setItem('sidebar_open', String(next))
      return next
    })
  }, [dense])

  const close = useCallback(() => {
    if (dense) { setEduOpen(false); return }
    setUserOpen(false)
    if (window.innerWidth >= 768) localStorage.setItem('sidebar_open', 'false')
  }, [dense])

  const setPin = useCallback((v: boolean) => {
    setIsPinned(v)
    localStorage.setItem('sidebar_pinned', String(v))
  }, [])

  return (
    <SidebarContext.Provider value={{ isOpen, isPinned, isMobile, toggle, close, setPin }}>
      {children}
    </SidebarContext.Provider>
  )
}

export const useSidebar = () => useContext(SidebarContext)
