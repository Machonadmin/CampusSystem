'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Плавный «набег» числа от 0 к value при появлении (classic KPI count-up).
 * Даёт статистике «дорогое» ощущение живого дашборда. Уважает
 * prefers-reduced-motion: при reduce показывает конечное значение сразу.
 * Локаль-форматирование — через toLocaleString (разделители тысяч).
 */
export default function CountUp({
  value,
  duration = 900,
  className,
  style,
}: {
  value: number
  duration?: number
  className?: string
  style?: React.CSSProperties
}) {
  const [display, setDisplay] = useState(value)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const target = Number.isFinite(value) ? value : 0
    if (reduce || target === 0) { setDisplay(target); return }

    let start: number | null = null
    const from = 0
    // easeOutCubic — быстрый старт, мягкое торможение к финалу.
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)

    const tick = (now: number) => {
      if (start === null) start = now
      const p = Math.min(1, (now - start) / duration)
      setDisplay(Math.round(from + (target - from) * ease(p)))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, duration])

  return <span className={className} style={style}>{display.toLocaleString()}</span>
}
