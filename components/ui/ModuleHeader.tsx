'use client'

import type { ReactNode } from 'react'
import { getModuleHeaderGradient } from '@/lib/module-colors'

/**
 * Единая градиентная шапка модуля. Раньше этот блок был скопирован inline в
 * ~60 страницах (одинаковый градиент + радиус + белый текст, но с разъезжавшимися
 * отступами/тенями). Теперь один компонент: тот же вид + встроенное появление
 * (.anim-rise). Слоты — leading `icon`/аватар и правые `actions`.
 *
 *   <ModuleHeader module="finance" title={t('title')} subtitle={t('sub')}
 *                 actions={<a …>…</a>} />
 */
export function ModuleHeader({
  module,
  title,
  subtitle,
  icon,
  actions,
  compact = false,
}: {
  module: string
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className="anim-rise"
      style={{
        background: getModuleHeaderGradient(module),
        borderRadius: 14,
        padding: compact ? '11px 22px' : '16px 24px',
        color: '#fff',
        boxShadow: 'var(--shadow)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        {icon}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: compact ? 15.5 : 20, fontWeight: 600, margin: 0, lineHeight: 1.25, minWidth: 0, overflowWrap: 'anywhere' }}>{title}</h1>
          {subtitle != null && subtitle !== '' && (
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2, overflowWrap: 'anywhere' }}>{subtitle}</div>
          )}
        </div>
      </div>
      {actions != null && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>
      )}
    </div>
  )
}
