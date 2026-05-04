'use client'
import Link from 'next/link'

interface Item { label: string; href?: string }

export function Breadcrumb({ items }: { items: Item[] }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ color: '#D1D5DB', fontSize: 13, userSelect: 'none' }}>›</span>}
          {item.href ? (
            <Link
              href={item.href}
              style={{ fontSize: 12, fontWeight: 500, color: '#3B82F6', textDecoration: 'none', background: '#EEF2FF', padding: '4px 10px', borderRadius: 6, transition: 'background 0.15s, color 0.15s' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#4BAED4'; el.style.color = '#fff' }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = '#EEF2FF'; el.style.color = '#3B82F6' }}
            >
              {item.label}
            </Link>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#3B82F6' }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
