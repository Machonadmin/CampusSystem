'use client'

import type { CSSProperties } from 'react'

export interface SubTab {
  key: string
  label: string
  visible?: boolean
}

interface Props {
  tabs: SubTab[]
  active: string
  onChange: (key: string) => void
  accentColor: string
}

export default function SubTabs({ tabs, active, onChange, accentColor }: Props) {
  const visibleTabs = tabs.filter(t => t.visible !== false)

  return (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface-2)',
    }}>
      {visibleTabs.map(t => {
        const isActive = t.key === active
        const style: CSSProperties = {
          padding: '11px 20px',
          fontSize: 13,
          fontWeight: isActive ? 600 : 500,
          color: isActive ? accentColor : 'var(--text-muted)',
          background: isActive ? 'var(--surface)' : 'transparent',
          border: 'none',
          borderBottom: `2px solid ${isActive ? accentColor : 'transparent'}`,
          cursor: 'pointer',
          marginBottom: -1,
          transition: 'all 0.15s ease',
        }
        return (
          <button key={t.key} onClick={() => onChange(t.key)} style={style}>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
