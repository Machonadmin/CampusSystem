import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'

/**
 * Карточка числа-сводки (дизайн-план, этап 4): одна на каждое число, в равной
 * сетке на всю ширину (<StatGrid>). Слева — маленькая иконка в мягком оттенке
 * цвета значения, подпись, крупное число и необязательный футер.
 */
export function StatCard({ label, value, color, icon, footer }: {
  label: string
  value: ReactNode
  /** Цвет числа и иконки; по умолчанию — основной текст. */
  color?: string
  icon?: IconName
  footer?: ReactNode
}) {
  const c = color ?? 'var(--text)'
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
      padding: '14px 16px', boxShadow: 'var(--shadow)', minWidth: 0,
    }}>
      <div className="stat-card-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {icon && (
          <span aria-hidden="true" style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'grid', placeItems: 'center',
            color: color ?? 'var(--text-muted)',
            background: `color-mix(in oklab, ${color ?? 'var(--text-muted)'} 13%, transparent)`,
            fontSize: 20,
          }}>
            <Icon name={icon} size={20} />
          </span>
        )}
        <div style={{ minWidth: 0, maxWidth: '100%' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
          <div className="stat-card-value" style={{ fontSize: 22, fontWeight: 800, color: c, marginTop: 2, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{value}</div>
        </div>
      </div>
      {footer && <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>{footer}</div>}
    </div>
  )
}

/** Равная сетка карточек на всю ширину; на телефоне — по две в ряд. */
export function StatGrid({ children, min = 170 }: { children: ReactNode; min?: number }) {
  return (
    <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }}>
      {children}
    </div>
  )
}
