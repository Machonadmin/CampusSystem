'use client'

import Link from 'next/link'
import { Fragment } from 'react'
import { useLang } from '@/lib/i18n/LanguageContext'

interface Item {
  label: string
  href?: string
}

interface Props {
  items: Item[]
}

// Всегда одна строка (замечание владельца 2026-10-13: в телефоне «מסך הבית»
// и «תלושי שכר» ломались на две строки). Ссылки не переносятся и не
// сжимаются; если места не хватает, обрезается многоточием последний пункт —
// текущий экран, чьё имя и так крупно стоит в шапке страницы.
export function Breadcrumb({ items }: Props) {
  const { isRTL } = useLang()
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      maxWidth: '100%',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      padding: '8px 14px',
      background: 'var(--surface-2)',
      borderRadius: 8,
      fontSize: 13,
      border: '1px solid var(--border)',
    }}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        return (
          <Fragment key={idx}>
            {idx > 0 && (
              <span style={{ color: 'var(--text-faint)', fontSize: 12, flexShrink: 0 }}>{isRTL ? '‹' : '›'}</span>
            )}
            {isLast ? (
              <span
                title={item.label}
                style={{ color: 'var(--text)', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {item.label}
              </span>
            ) : item.href ? (
              <Link
                href={item.href}
                style={{
                  color: 'var(--text-muted)',
                  textDecoration: 'none',
                  flexShrink: 0,
                }}
              >
                {item.label}
              </Link>
            ) : (
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{item.label}</span>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
