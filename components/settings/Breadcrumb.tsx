'use client'
import Link from 'next/link'

interface Item { label: string; href?: string }

export function Breadcrumb({ items }: { items: Item[] }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && <span style={{ color: '#D1D5DB', fontSize: 14, userSelect: 'none' }}>›</span>}
          {item.href ? (
            <Link
              href={item.href}
              style={{ fontSize: 13, color: '#4BAED4', textDecoration: 'none' }}
            >
              {item.label}
            </Link>
          ) : (
            <span style={{ fontSize: 13, color: '#6B7280' }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
