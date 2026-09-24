'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Тонкий прогресс-бар навигации в самом верху экрана (как в YouTube/GitHub).
 * Появляется, как только пользователь кликает по ссылке/карточке, ведущей на
 * другой экран, «подтекает» к ~90 % и завершается, когда маршрут сменился —
 * даёт ощущение «сейчас будет у тебя».
 *
 * Next 14 App Router не даёт события «начало навигации», поэтому старт ловим по
 * клику на <a> (Link рендерит <a>) и по history.pushState (программные push),
 * а завершение — по смене pathname/searchParams. Есть страховочный таймаут,
 * чтобы бар не завис, если переход не случился.
 *
 * Монтируется один раз (в dashboard layout, обёрнут в <Suspense> из-за
 * useSearchParams).
 */
export default function TopProgressBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)

  const active = useRef(false)
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null)
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fade = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstRender = useRef(true)

  const clearTimers = () => {
    if (trickle.current) { clearInterval(trickle.current); trickle.current = null }
    if (safety.current) { clearTimeout(safety.current); safety.current = null }
  }

  const start = () => {
    if (active.current) return
    active.current = true
    if (fade.current) { clearTimeout(fade.current); fade.current = null }
    setVisible(true)
    let p = 8
    setWidth(p)
    trickle.current = setInterval(() => {
      p += (90 - p) * 0.14   // плавно приближаемся к 90 %, не достигая
      setWidth(p)
    }, 240)
    safety.current = setTimeout(() => done(), 12000) // не зависать
  }

  const done = () => {
    if (!active.current) return
    active.current = false
    clearTimers()
    setWidth(100)
    fade.current = setTimeout(() => {
      setVisible(false)
      fade.current = setTimeout(() => setWidth(0), 260)
    }, 220)
  }

  // Старт навигации: клики по ссылкам + программные history.pushState.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const a = target?.closest?.('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('#')) return
      if (a.target && a.target !== '_self') return
      if (a.hasAttribute('download')) return
      let url: URL
      try { url = new URL(a.href, window.location.href) } catch { return }
      if (url.origin !== window.location.origin) return
      // Тот же адрес (путь+query) — навигации не будет.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      start()
    }
    document.addEventListener('click', onClick, true)

    const origPush = history.pushState
    history.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
      start()
      return origPush.apply(this, args)
    }

    return () => {
      document.removeEventListener('click', onClick, true)
      history.pushState = origPush
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Завершение: маршрут сменился.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    done()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams])

  useEffect(() => () => { clearTimers(); if (fade.current) clearTimeout(fade.current) }, [])

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', top: 0, insetInline: 0, height: 3, zIndex: 11000,
        pointerEvents: 'none', opacity: visible ? 1 : 0, transition: 'opacity .25s',
      }}
    >
      <div
        style={{
          height: '100%', width: `${width}%`,
          background: 'linear-gradient(90deg, var(--accent), var(--accent-strong))',
          boxShadow: '0 0 10px var(--accent), 0 0 4px var(--accent)',
          borderRadius: '0 3px 3px 0', transition: 'width .3s ease',
        }}
      />
    </div>
  )
}
