'use client'

import Link from 'next/link'
import { Fragment } from 'react'

interface Item {
  label: string
  href?: string
}

interface Props {
  items: Item[]
}

export function Breadcrumb({ items }: Props) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 14px',
      background: '#F3F4F6',
      borderRadius: 8,
      fontSize: 13,
      border: '1px solid #E5E7EB',
    }}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        return (
          <Fragment key={idx}>
            {idx > 0 && (
              <span style={{ color: '#D1D5DB', fontSize: 12 }}>›</span>
            )}
            {isLast ? (
              <span style={{ color: '#111827', fontWeight: 600 }}>
                {item.label}
              </span>
            ) : item.href ? (
              <Link
                href={item.href}
                style={{
                  color: '#6B7280',
                  textDecoration: 'none',
                }}
              >
                {item.label}
              </Link>
            ) : (
              <span style={{ color: '#6B7280' }}>{item.label}</span>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
