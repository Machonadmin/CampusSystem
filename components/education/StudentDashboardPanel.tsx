'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Summary {
  attendance: { present: number; late: number; absent: number; marked: number; total_lessons: number; percent: number | null }
  grades: { graded_count: number; total_assessments: number; average: number | null }
}

function pctColor(p: number | null): string {
  if (p === null) return 'var(--text-faint)'
  if (p >= 85) return 'var(--success)'
  if (p >= 70) return 'var(--warn)'
  return 'var(--danger)'
}
const pct = (p: number | null) => (p === null ? '—' : `${p}%`)

/**
 * Дашборд студентки (§5): число уроков с начала года, % посещаемости, средний
 * балл — плюс разбивка present/late/absent. Питается существующим отчётом
 * journeys/[id]/report (только чтение).
 */
export default function StudentDashboardPanel({ journeyId }: { journeyId: string; canEdit?: boolean }) {
  const t = useTranslations('education.student_dashboard')
  const [s, setS] = useState<Summary | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/education/journeys/${journeyId}/report`)
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (alive) setS(b?.summary ?? null) })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [journeyId])

  if (!loaded) return null

  const a = s?.attendance
  const g = s?.grades

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>{t('title')}</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 10 }}>
        <Stat label={t('lessons')} value={String(a?.total_lessons ?? 0)} />
        <Stat label={t('attendance')} value={pct(a?.percent ?? null)} color={pctColor(a?.percent ?? null)} />
        <Stat label={t('grade_avg')} value={pct(g?.average ?? null)} color={pctColor(g?.average ?? null)} />
      </div>

      {/* Разбивка посещаемости */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', fontSize: 12 }}>
        <Chip color="var(--success)" label={t('present')} n={a?.present ?? 0} />
        <Chip color="var(--warn)" label={t('late')} n={a?.late ?? 0} />
        <Chip color="var(--danger)" label={t('absent')} n={a?.absent ?? 0} />
        <span style={{ color: 'var(--text-faint)' }}>{t('marked')}: {a?.marked ?? 0}</span>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? 'var(--text)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{value}</div>
    </div>
  )
}

function Chip({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-muted)' }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
      {label} <b style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{n}</b>
    </span>
  )
}
