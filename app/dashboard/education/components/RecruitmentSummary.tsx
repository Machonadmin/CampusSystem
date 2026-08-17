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

function stageCount(r: Report, stage: string): number {
  return r.by_stage.find(s => s.stage === stage)?.count ?? 0
}

export default function RecruitmentSummary() {
  const t = useTranslations('education.recruitment_report')
  const tSource = useTranslations('education.card')
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
  const topSourceLabel = topSource
    ? `${tSource(`source.${topSource.source}`, topSource.source)} · ${topSource.count}`
    : '—'

  const tiles = [
    { label: t('total_leads'), value: String(report.total_leads), accent: 'var(--accent-strong)' },
    { label: t('stage_interested'), value: String(stageCount(report, 'interested')), accent: 'var(--info, #2563EB)' },
    { label: t('stage_in_process'), value: String(stageCount(report, 'in_process')), accent: 'var(--warn)' },
    { label: t('dash_top_source'), value: topSourceLabel, accent: 'var(--violet)' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
      {tiles.map((tile, i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderInlineStart: `3px solid ${tile.accent}`, borderRadius: 10, padding: '11px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{tile.label}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{tile.value}</div>
        </div>
      ))}
      <a href="/dashboard/education/recruitment-report"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--accent-tint)', border: '1px dashed var(--accent)', borderRadius: 10, padding: '11px 14px', textDecoration: 'none' }}>
        {t('dash_full_report')}
      </a>
    </div>
  )
}
