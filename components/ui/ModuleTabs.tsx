'use client'

import type { CSSProperties } from 'react'

export interface ModuleTab {
  key: string
  label: string
  visible?: boolean
  badge?: number
}

interface Props {
  tabs: ModuleTab[]
  active: string
  onChange: (key: string) => void
  accentColor: string
  /** 'box' — прежние вкладки-коробки (по умолчанию); 'underline' — лёгкие вкладки с подчёркиванием. */
  variant?: 'box' | 'underline'
}

export default function ModuleTabs({ tabs, active, onChange, accentColor, variant = 'box' }: Props) {
  const visibleTabs = tabs.filter(t => t.visible !== false)
  const underline = variant === 'underline'

  return (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid var(--border)',
      gap: underline ? 6 : 4,
      flexWrap: 'wrap',
    }}>
      {visibleTabs.map(t => {
        const isActive = t.key === active
        const style: CSSProperties = underline
          ? {
            padding: '9px 14px',
            fontSize: 13.5,
            fontWeight: isActive ? 700 : 500,
            color: isActive ? accentColor : 'var(--text-muted)',
            background: 'transparent',
            border: 'none',
            borderBottom: `2.5px solid ${isActive ? accentColor : 'transparent'}`,
            borderRadius: 0,
            cursor: 'pointer',
            marginBottom: -1,
            transition: 'all 0.15s ease',
          }
          : {
            padding: '10px 28px',
            fontSize: 13,
            fontWeight: isActive ? 600 : 500,
            color: isActive ? accentColor : 'var(--text-muted)',
            background: isActive ? `${accentColor}18` : 'var(--surface)',
            border: `1px solid ${isActive ? accentColor : 'var(--border)'}`,
            borderBottom: 'none',
            borderRadius: '8px 8px 0 0',
            cursor: 'pointer',
            marginBottom: -1,
            transition: 'all 0.15s ease',
          }
        return (
          <button key={t.key} onClick={() => onChange(t.key)} style={style}>
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>({t.badge})</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
