'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useLang } from '@/lib/i18n/LanguageContext'

interface Props {
  label: string
  onClick: () => void
  accentColor: string
  icon?: ReactNode
  disabled?: boolean
  style?: CSSProperties
}

export default function PageActionButton({
  label, onClick, accentColor, icon, disabled, style,
}: Props) {
  // Значок («+») всегда слева от текста (решение владельца): в иврите это
  // после текста, в ru/en — как было, перед ним. Одинаково во всех экранах.
  const { isRTL } = useLang()
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        flexDirection: isRTL ? 'row-reverse' : 'row',
        padding: '10px 18px', fontSize: 13, fontWeight: 500,
        background: accentColor, color: '#fff',
        border: 'none', borderRadius: 8,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 0.15s',
        whiteSpace: 'nowrap',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.opacity = '0.9' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = disabled ? '0.5' : '1' }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>{icon ?? '+'}</span>
      <span>{label}</span>
    </button>
  )
}
