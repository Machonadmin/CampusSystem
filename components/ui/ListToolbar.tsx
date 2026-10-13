'use client'

import type { ReactNode } from 'react'

// ─── Шапка списка: одинаковая во всех списках ─────────────────────────────────
//
// Решение владельца 2026-10-13 («עדיף בהכל שיהיה לזה צורה אחידה»):
//   1-я строка — поиск и кнопки экрана. Поиск растягивается, кнопки стоят
//                рядом с ним, в конце строки. Под поиск они уходят, только если
//                на очень узком экране не остаётся даже 120px на поиск.
//   2-я строка — фильтры (списки выбора, переключатели), если они есть.
//   Ниже       — счётчик («סך הכול: 10») своей строкой: кнопка его больше не
//                вытесняет.

interface Props {
  /** Поле поиска — обычно <ListSearchInput>. */
  search: ReactNode
  /** Кнопки экрана (создать, экспорт…) — в одной строке с поиском. */
  actions?: ReactNode
  /** Фильтры — второй строкой. */
  filters?: ReactNode
  /** Счётчик — отдельной строкой под всем остальным. */
  count?: ReactNode
}

export function ListToolbar({ search, actions, filters, count }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 120px', minWidth: 0, maxWidth: 420 }}>{search}</div>
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginInlineStart: 'auto' }}>
            {actions}
          </div>
        )}
      </div>
      {filters && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {filters}
        </div>
      )}
      {count != null && count !== false && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{count}</div>
      )}
    </div>
  )
}

/** Поле поиска в шапке списка — один вид во всех списках. */
export function ListSearchInput({ value, onChange, placeholder, ariaLabel }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel?: string
}) {
  return (
    <input
      aria-label={ariaLabel ?? placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', boxSizing: 'border-box',
        fontSize: 13, padding: '9px 12px',
        border: '1px solid var(--border-strong)', borderRadius: 8,
        background: 'var(--surface)', color: 'var(--text)',
      }}
    />
  )
}
