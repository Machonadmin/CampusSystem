'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const accent = accentColor || 'var(--text)'
  // Меню позиционируем через position:fixed по факт. координатам кнопки и
  // ЗАЖИМАЕМ в границы окна — иначе на узком экране (мобильный, cards-sm)
  // всплывашка «убегала за край» и обрезалась.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const items = actions.filter(a => !a.hidden)

  // Пересчёт положения: под кнопкой, выровнено по нужному краю, но не вылезая
  // за 8px-поля окна. Если снизу не помещается — раскрываем вверх.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const place = () => {
      const btn = btnRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const menuW = menuRef.current?.offsetWidth || 160
      const menuH = menuRef.current?.offsetHeight || 0
      const M = 8
      const vw = window.innerWidth, vh = window.innerHeight
      let left = align === 'end' ? r.right - menuW : r.left
      left = Math.min(Math.max(M, left), Math.max(M, vw - menuW - M))
      let top = r.bottom + 4
      if (menuH && top + menuH > vh - M) {
        const above = r.top - 4 - menuH
        if (above >= M) top = above
        else top = Math.max(M, vh - menuH - M)
      }
      setPos({ top, left })
    }
    place()
    // повторный расчёт после того как узнали реальную ширину/высоту меню
    const raf = requestAnimationFrame(place)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, align])

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
        ref={btnRef}
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
          ref={menuRef}
          role="menu"
          className="anim-pop"
          style={{
            position: 'fixed',
            zIndex: 60,
            top: pos?.top ?? -9999,
            left: pos?.left ?? -9999,
            visibility: pos ? 'visible' : 'hidden',
            minWidth: 160,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: 'var(--shadow)',
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
                color: a.danger ? 'var(--danger)' : 'var(--text)',
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
