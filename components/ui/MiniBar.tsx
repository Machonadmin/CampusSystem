'use client'

/**
 * Крошечная составная полоса-пропорция (stacked proportion bar). Единый «мини-
 * график» для дашбордов: доли сегментов от суммы, в токенах темы. Пустая сумма →
 * нейтральный трек. Заголовки сегментов дают нативный тултип (title).
 *
 *   <MiniBar segments={[{ value: paid, color: 'var(--success)', label: '…' },
 *                        { value: due,  color: 'var(--danger)',  label: '…' }]} />
 */
export interface BarSegment { value: number; color: string; label?: string }

export function MiniBar({
  segments,
  height = 8,
  rounded = true,
  track = 'var(--surface-2)',
}: {
  segments: BarSegment[]
  height?: number
  rounded?: boolean
  track?: string
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0)
  return (
    <div
      style={{
        display: 'flex', width: '100%', height, background: track,
        borderRadius: rounded ? height : 3, overflow: 'hidden',
      }}
      role="img"
      aria-label={segments.map(s => s.label).filter(Boolean).join(' · ') || undefined}
    >
      {total > 0 && segments.map((s, i) => {
        const pct = Math.max(0, s.value) / total * 100
        if (pct <= 0) return null
        return (
          <div
            key={i}
            title={s.label}
            style={{ width: `${pct}%`, background: s.color, height: '100%' }}
          />
        )
      })}
    </div>
  )
}
