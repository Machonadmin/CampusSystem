'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Самопроверка «ניהול עובדים» (запрос владельца: «נמאס לי לבדוק»).
 * Показывается ТОЛЬКО когда есть проблемы; всё чисто → ничего не рендерим.
 * Данные: /api/staff/health (логины с пустым экраном / без посадки) +
 * /api/persons/duplicates (кластеры вероятных дублей). Только superadmin —
 * родитель гейтит рендер, эндпоинты гейтят сами.
 */

interface HealthPerson { person_id: string; name: string; login_email: string }

export default function HealthPanel({ refreshSignal, onOpenMerge }: {
  refreshSignal: number
  onOpenMerge: () => void
}) {
  const t = useTranslations('staff.health')
  const [blankScreen, setBlankScreen] = useState<HealthPerson[]>([])
  const [noSeat, setNoSeat] = useState<HealthPerson[]>([])
  const [dupClusters, setDupClusters] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/staff/health').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/persons/duplicates').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([health, dups]) => {
      if (!alive) return
      setBlankScreen(Array.isArray(health?.blank_screen) ? health.blank_screen : [])
      setNoSeat(Array.isArray(health?.no_seat) ? health.no_seat : [])
      setDupClusters(Array.isArray(dups?.clusters) ? dups.clusters.length : 0)
    })
    return () => { alive = false }
  }, [refreshSignal])

  const total = blankScreen.length + noSeat.length + (dupClusters > 0 ? 1 : 0)
  if (total === 0) return null

  const item: React.CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, color: 'var(--text)', flexWrap: 'wrap' }
  const fix: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)' }

  return (
    <div className="anim-rise" style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--warn-tint)', border: '1px solid var(--warn)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'start' }}
      >
        <span style={{ fontSize: 15 }}>⚠️</span>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: 'var(--warn)' }}>
          {t('title').replace('{count}', String(blankScreen.length + noSeat.length + dupClusters))}
        </span>
        <span style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 600 }}>{open ? t('hide') : t('show')}</span>
      </button>

      {open && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {blankScreen.map(p => (
            <div key={`b_${p.person_id}`} style={item}>
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span>{t('blank_screen')}</span>
              <span style={fix}>{t('blank_screen_fix')}</span>
            </div>
          ))}
          {noSeat.map(p => (
            <div key={`s_${p.person_id}`} style={item}>
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span>{t('no_seat')}</span>
              <span style={fix}>{t('no_seat_fix')}</span>
            </div>
          ))}
          {dupClusters > 0 && (
            <div style={item}>
              <span>{t('duplicates').replace('{count}', String(dupClusters))}</span>
              <button
                onClick={onOpenMerge}
                style={{ padding: '3px 12px', fontSize: 12, fontWeight: 600, borderRadius: 99, cursor: 'pointer', background: 'var(--surface)', color: 'var(--warn)', border: '1px solid var(--warn)' }}
              >{t('duplicates_fix')}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
