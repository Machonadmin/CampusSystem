'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

export interface RowAction {
  key: string
  label: string
  onClick: () => void
  /** Красная (деструктивная) подсветка. */
  danger?: boolean
  disabled?: boolean
  /** Скрыть пункт целиком (удобно для условных действий). */
  hidden?: boolean
}

/**
 * Компактное меню действий по строке: одна кнопка «⋯», а под ней список
 * действий. Заменяет ряды из 3–6 кнопок в таблицах — меньше визуального шума.
 *
 * Действия с `hidden: true` отфильтровываются. Если после фильтрации не
 * осталось ни одного действия — не рендерится ничего.
 */
export function RowActionsMenu({
  actions,
  accentColor,
  ariaLabel,
  align = 'end',
}: {
  actions: RowAction[]
  accentColor?: string
  ariaLabel?: string
  /** С какой стороны кнопки открывать список. */
  align?: 'start' | 'end'
}) {
  const t = useTranslations('common')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const accent = accentColor || 'var(--text)'

  const items = actions.filter(a => !a.hidden)

  useEffect(() => {
    if (!open) return
    const onOut = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onOut)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onOut)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  if (items.length === 0) return null

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label={ariaLabel || t('actions')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        style={{
          background: open ? 'var(--surface-2)' : 'none',
          border: 'none',
          cursor: 'pointer',
          color: accent,
          fontSize: 18,
          lineHeight: 1,
          fontWeight: 700,
          borderRadius: 8,
          padding: '2px 8px',
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            zIndex: 40,
            top: 'calc(100% + 4px)',
            insetInlineEnd: align === 'end' ? 0 : 'auto',
            insetInlineStart: align === 'start' ? 0 : 'auto',
            minWidth: 160,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            padding: 4,
            display: 'grid',
            gap: 1,
          }}
        >
          {items.map(a => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              disabled={a.disabled}
              onClick={e => {
                e.stopPropagation()
                setOpen(false)
                a.onClick()
              }}
              style={{
                textAlign: 'start',
                background: 'none',
                border: 'none',
                borderRadius: 7,
                cursor: a.disabled ? 'not-allowed' : 'pointer',
                opacity: a.disabled ? 0.45 : 1,
                fontSize: 13,
                fontWeight: 500,
                color: a.danger ? '#DC2626' : 'var(--text)',
                padding: '8px 12px',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!a.disabled) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
