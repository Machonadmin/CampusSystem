import type { CSSProperties } from 'react'

/**
 * Маленький крутящийся индикатор для кнопок/строк в состоянии загрузки.
 * По умолчанию наследует цвет текста (currentColor) — на цветной кнопке
 * достаточно поставить <Spinner /> рядом с подписью. Анимация уважает
 * prefers-reduced-motion (замедляется, а не дёргается).
 */
export function Spinner({
  size = 14,
  thickness = 2,
  color = 'currentColor',
  style,
}: {
  size?: number
  thickness?: number
  color?: string
  style?: CSSProperties
}) {
  return (
    <span
      className="campus-spinner"
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `${thickness}px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'campus-spin 0.6s linear infinite',
        flexShrink: 0,
        ...style,
      }}
    />
  )
}
