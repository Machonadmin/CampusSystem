'use client'

import { useLang } from '@/lib/i18n/LanguageContext'

/**
 * Единый шеврон (Heroicons) вместо текстовых глифов ▶ / ▲ / ▼.
 *
 * variant 'row'    — индикатор раскрытия строки: закрыт → указывает в начало
 *                    строки (RTL-безопасно, ◀ в иврите / ▶ в LTR), открыт → вниз.
 * variant 'toggle' — вниз/вверх (например, панель фильтров): закрыт ▼, открыт ▲.
 *
 * Цвет по умолчанию var(--text-faint); передайте color="currentColor" (или иной),
 * чтобы наследовать цвет контекста (кнопки фильтров).
 */
export function Caret({ open, variant = 'row', size = 12, color }: {
  open: boolean
  variant?: 'row' | 'toggle'
  size?: number
  color?: string
}) {
  const { isRTL } = useLang()
  const deg = variant === 'row'
    ? (open ? 0 : (isRTL ? 90 : -90))
    : (open ? 180 : 0)
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      aria-hidden="true"
      style={{
        color: color ?? 'var(--text-faint)', flexShrink: 0,
        transition: 'transform .15s', transform: `rotate(${deg}deg)`,
      }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  )
}
