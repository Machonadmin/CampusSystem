'use client'

import type { ReactNode } from 'react'
import { DownloadIcon } from '@/components/ui/DownloadIcon'

// ─── Шапка списка: одинаковая во всех списках ─────────────────────────────────
//
// Решение владельца 2026-10-13 («עדיף בהכל שיהיה לזה צורה אחידה»):
//   1-я строка — поиск и кнопки экрана. Поиск растягивается, кнопки стоят
//                рядом с ним, в конце строки. Под поиск они уходят, только если
//                на очень узком экране не остаётся даже 120px на поиск.
//   2-я строка — фильтры (списки выбора, переключатели), если они есть.
//   Ниже       — счётчик («סך הכול: 10») своей строкой: кнопка его больше не
//                вытесняет.
//
// Список без поиска (заметка владельца 2026-10-15 про «תחזוקה»: «הסטטוסים,
// ייצוא והשלישי … באותה השורה»): фильтры и кнопки — ОДНОЙ строкой. Списки
// выбора сжимаются (.list-toolbar-filters в globals.css), чтобы кнопки
// поместились рядом; кнопки уходят на следующую строку, только если фильтрам
// не остаётся и 240px.

interface Props {
  /** Поле поиска — обычно <ListSearchInput>. Без него — фильтры и кнопки одной строкой. */
  search?: ReactNode
  /** Кнопки экрана (создать, экспорт…) — в одной строке с поиском. */
  actions?: ReactNode
  /** Фильтры — второй строкой (без поиска — в первой, рядом с кнопками). */
  filters?: ReactNode
  /** Счётчик — отдельной строкой под всем остальным. */
  count?: ReactNode
}

export function ListToolbar({ search, actions, filters, count }: Props) {
  const countRow = count != null && count !== false && (
    <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{count}</div>
  )

  if (search == null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          {filters && (
            <div className="list-toolbar-filters" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', flex: '1 1 240px', minWidth: 0 }}>
              {filters}
            </div>
          )}
          {actions && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginInlineStart: 'auto', flex: 'none' }}>
              {actions}
            </div>
          )}
        </div>
        {countRow}
      </div>
    )
  }

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
      {countRow}
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

/**
 * Кнопка «ייצוא ל-CSV» для шапки списка: иконка и подпись в одну строку. На
 * телефоне подпись прячется (.label-hide-sm) и остаётся только иконка — так
 * кнопка влезает в строку рядом с фильтрами, а не уходит под них и не ставит
 * иконку над словом (заметка владельца 2026-10-15).
 */
export function ListExportButton({ onClick, disabled, label }: {
  onClick: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        minWidth: 34, height: 32, padding: '0 10px', boxSizing: 'border-box',
        fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
        border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)',
        color: disabled ? 'var(--text-faint)' : 'var(--text)', cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <DownloadIcon size={16} />
      <span className="label-hide-sm">{label}</span>
    </button>
  )
}
