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

export function Breadcrumb({ items }: Props) {
  const { isRTL } = useLang()
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
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
              <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>{isRTL ? '‹' : '›'}</span>
            )}
            {isLast ? (
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                {item.label}
              </span>
            ) : item.href ? (
              <Link
                href={item.href}
                style={{
                  color: 'var(--text-muted)',
                  textDecoration: 'none',
                }}
              >
                {item.label}
              </Link>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
