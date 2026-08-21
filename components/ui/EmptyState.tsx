'use client'

import type { CSSProperties } from 'react'

// Единый вид для «пусто / загрузка / нет данных» по всему экрану «Учёба»
// (раньше в каждом месте были слегка разные padding/font). size='compact' —
// для тесных тел карточек (дашборд), 'default' — для таблиц и рабочих областей.
export default function EmptyState({ text, size = 'default', style }: {
  text: string
  size?: 'default' | 'compact'
  style?: CSSProperties
}) {
  return (
    <div style={{
      padding: size === 'compact' ? '20px 0' : '36px 16px',
      textAlign: 'center', fontSize: 13.5, color: 'var(--text-faint)',
      ...style,
    }}>
      {text}
    </div>
  )
}
