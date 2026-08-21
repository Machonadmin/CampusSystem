'use client'

import type { CSSProperties } from 'react'

// Мягкий скелетон-плейсхолдер (мерцание) вместо текстового «טוען…». Показывает
// «форму» будущего контента, пока он грузится. Токены темы → работает в обеих.
// Класс campus-sk позволяет prefers-reduced-motion отключить мерцание.
const shimmer: CSSProperties = {
  backgroundColor: 'var(--surface-2)',
  backgroundImage: 'linear-gradient(90deg, var(--surface-2) 0%, var(--border) 40%, var(--surface-2) 80%)',
  backgroundSize: '300% 100%',
  animation: 'campus-shimmer 1.4s linear infinite',
}

export function Skeleton({ width = '100%', height = 12, radius = 8, circle = false, style }: {
  width?: number | string
  height?: number | string
  radius?: number
  circle?: boolean
  style?: CSSProperties
}) {
  return (
    <span
      className="campus-sk"
      aria-hidden="true"
      style={{
        display: 'block',
        width: circle ? height : width,
        height,
        borderRadius: circle ? '50%' : radius,
        flexShrink: 0,
        ...shimmer,
        ...style,
      }}
    />
  )
}

// Готовый скелетон списка/таблицы: N строк «аватар + две строки текста».
// Единый вид ожидания контента по всему приложению.
export function SkeletonRows({ rows = 4, avatar = true, style }: {
  rows?: number
  avatar?: boolean
  style?: CSSProperties
}) {
  return (
    <div role="status" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 2px', ...style }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {avatar && <Skeleton circle height={32} />}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Skeleton width={`${44 + (i % 3) * 8}%`} height={12} />
            <Skeleton width={`${68 + (i % 2) * 10}%`} height={10} />
          </div>
        </div>
      ))}
    </div>
  )
}
