'use client'

import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, type ReactNode } from 'react'

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

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(true)
  const [isPinned, setIsPinned] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useIsoLayoutEffect(() => {
    const mobile = window.innerWidth < 768
    setIsMobile(mobile)
    if (mobile) {
      setIsOpen(false)
      setIsPinned(false)
    } else {
      const savedOpen = localStorage.getItem('sidebar_open')
      const savedPin = localStorage.getItem('sidebar_pinned')
      if (savedOpen !== null) setIsOpen(savedOpen === 'true')
      if (savedPin !== null) setIsPinned(savedPin === 'true')
    }

    function onResize() {
      const m = window.innerWidth < 768
      setIsMobile(m)
      if (m) setIsOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen(v => {
      const next = !v
      if (window.innerWidth >= 768) localStorage.setItem('sidebar_open', String(next))
      return next
    })
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    if (window.innerWidth >= 768) localStorage.setItem('sidebar_open', 'false')
  }, [])

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
