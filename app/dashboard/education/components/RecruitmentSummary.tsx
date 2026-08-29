'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Компактная сводка набора (дашборд гиюса, п. ט·ג) — стат-плитки прямо во
 * вкладке גיוс. Переиспользует существующий отчёт /api/education/recruitment-report
 * (там уже считаются total/by_stage/by_source), так что это лёгкая витрина, а не
 * новый расчёт. Ссылка «דוח מלא» ведёт в полный отчёт.
 */

interface Report {
  total_leads: number
  by_stage: Array<{ stage: string; count: number }>
  by_source: Array<{ source: string; count: number }>
}

export default function RecruitmentSummary() {
  const t = useTranslations('education.recruitment_report')
  const tSource = useTranslations('education.card')
  const tEdu = useTranslations('education')
  const [report, setReport] = useState<Report | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/education/recruitment-report')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive && d) setReport(d) })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  if (!loaded || !report) return null

  const topSource = [...report.by_source].sort((a, b) => b.count - a.count)[0]

  // Owner: пустые нули не показываем — плитка с 0 скрывается (как в «Учёбе»).
  // Плитка «דוח מלא» убрана: рядом уже есть чип «דוחות גיוס» на тот же адрес.
  // Плитки этапов — по РЕАЛЬНЫМ активным workflow-этапам (ручной флаг
  // interested/in_process удалён по решению владельца).
  const STAGE_ACCENTS = ['var(--info, #2563EB)', 'var(--warn)', 'var(--success)', 'var(--violet)']
  const tiles = [
    { label: t('total_leads'), value: report.total_leads, accent: 'var(--accent-strong)' },
    ...report.by_stage.slice(0, 3).map((s, i) => ({
      label: tEdu(`process.stages.${s.stage}`, s.stage),
      value: s.count,
      accent: STAGE_ACCENTS[i % STAGE_ACCENTS.length],
    })),
  ].filter(tile => tile.value > 0)
  if (topSource && topSource.count > 0) {
    tiles.push({ label: t('dash_top_source'), value: topSource.count, accent: 'var(--violet)' })
  }
  if (tiles.length === 0) return null

  const display = (tile: { label: string; value: number }) =>
    tile.label === t('dash_top_source') && topSource
      ? `${tSource(`source.${topSource.source}`, topSource.source)} · ${topSource.count}`
      : String(tile.value)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
      {tiles.map((tile, i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderInlineStart: `3px solid ${tile.accent}`, borderRadius: 10, padding: '11px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{tile.label}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{display(tile)}</div>
        </div>
      ))}
    </div>
  )
}
