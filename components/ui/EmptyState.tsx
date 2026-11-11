'use client'

import type { CSSProperties, ReactNode } from 'react'
import { MODULE_ICON_PATHS, type ModuleIconKey } from '@/lib/nav/module-icons'

// Единый вид «пусто / нет данных». size='compact' — для тесных тел карточек
// (дашборд): только текст, без эмблемы, чтобы не раздувать. 'default' — для
// таблиц/рабочих областей: мягкая эмблема в тинте + подъём при появлении, чтобы
// пустой экран выглядел законченным, а не «сломанным». icon — необязательная
// замена дефолтной эмблемы (входящие). module — эмблема = иконка модуля из
// бокового меню (дизайн-план, этап 4). Эмблема окрашена в мягкий оттенок
// модуля страницы (--action/--action-contrast, см. globals.css) — тот же, что
// у основной кнопки. action — необязательная кнопка под текстом.
export default function EmptyState({ text, size = 'default', icon, module, action, style }: {
  text: string
  size?: 'default' | 'compact'
  icon?: ReactNode
  module?: ModuleIconKey
  action?: ReactNode
  style?: CSSProperties
}) {
  if (size === 'compact') {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13.5, color: 'var(--text-faint)', ...style }}>
        {text}
      </div>
    )
  }
  return (
    <div className="anim-rise" style={{
      padding: '40px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      textAlign: 'center', ...style,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, flexShrink: 0,
        background: 'var(--action)', color: 'var(--action-contrast)',
        boxShadow: 'inset 0 0 0 1px var(--action-border)',
        display: 'grid', placeItems: 'center',
      }}>
        {icon ?? (module ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={MODULE_ICON_PATHS[module]} />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
          </svg>
        ))}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 340, lineHeight: 1.5 }}>{text}</div>
      {action}
    </div>
  )
}
