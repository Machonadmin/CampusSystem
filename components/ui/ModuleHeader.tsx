'use client'

import type { ReactNode } from 'react'
import { getModuleColor } from '@/lib/module-colors'

/**
 * Единая шапка модуля. Раньше этот блок был скопирован inline в ~60 страницах
 * (одинаковый градиент + радиус + белый текст, но с разъезжавшимися отступами
 * и тенями). Теперь один компонент: общий вид + появление (.anim-rise).
 * Слоты — leading `icon`/аватар и правые `actions`.
 *
 * ВИД. Раньше это был плотный цветной градиент с белым текстом. По решению
 * владельца шапка стала СПОКОЙНОЙ: обычная поверхность, обычный текст и тонкая
 * цветная полоса модуля с логического начала (в RTL — справа). Причина: на
 * экране было слишком много цвета, и цветной блок в каждой шапке перетягивал
 * внимание с самих данных. Цвет модуля никуда не делся — он остался как
 * опознавательный знак, но перестал быть фоном.
 *
 * ВАЖНО для вызывающих: внутри шапки БОЛЬШЕ НЕТ белого текста. Всё, что
 * передаётся в `icon`/`actions`/`subtitle`, должно брать цвет из токенов
 * (var(--text) / var(--text-muted)), а не из литерального #fff — иначе на
 * светлой поверхности оно станет невидимым.
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
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        // Логическое свойство: в RTL полоса встаёт справа, в LTR — слева.
        borderInlineStart: `4px solid ${getModuleColor(module)}`,
        borderRadius: 'var(--r-lg)',
        padding: compact ? '11px 22px' : '16px 24px',
        color: 'var(--text)',
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
            // Приглушённый токен вместо прежней opacity .85 поверх белого.
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, overflowWrap: 'anywhere' }}>{subtitle}</div>
          )}
        </div>
      </div>
      {actions != null && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{actions}</div>
      )}
    </div>
  )
}
