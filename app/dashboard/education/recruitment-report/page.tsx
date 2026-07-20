'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'

// ─── Типы ответа API ────────────────────────────────────────────────────────
interface Report {
  total_leads: number
  by_source: Array<{ source: string; count: number }>
  by_stage: Array<{ stage: string; count: number }>
  by_age: Array<{ bucket: string; count: number }>
  by_country: Array<{ country: string; count: number }>
  by_city: Array<{ city: string; count: number }>
  conversion: {
    leads: number
    applicants: number
    students: number
    lead_to_applicant: number
    applicant_to_student: number
  }
  by_month: Array<{ month: string; count: number }>
}

type T = (key: string, fallback?: string) => string

export default function RecruitmentReportPage() {
  const t = useTranslations('education.recruitment_report')
  const tNav = useTranslations('navigation')

  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/education/recruitment-report')
        if (res.status === 403 || res.status === 401) { setForbidden(true); return }
        if (res.ok) setReport(await res.json())
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '12px 24px' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('subtitle')}</p>
      </div>

      {forbidden ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('forbidden')}</div>
      ) : loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('loading')}</div>
      ) : !report ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('empty')}</div>
      ) : (
        <Dashboard report={report} t={t} />
      )}
    </div>
  )
}

function Dashboard({ report, t }: { report: Report; t: T }) {
  const conv = report.conversion
  // Конверсия «лид → студентка» как ведущий KPI: доля студенток от когда-либо лидов.
  const convRate = conv.lead_to_applicant

  const stageLabel = (stage: string): string => {
    if (stage === 'interested') return t('stage_interested')
    if (stage === 'in_process') return t('stage_in_process')
    if (stage === 'unknown') return t('unknown')
    return stage
  }
  const ageLabel = (bucket: string): string => {
    switch (bucket) {
      case '<18': return t('age_lt18')
      case '18-20': return t('age_18_20')
      case '21-25': return t('age_21_25')
      case '26-30': return t('age_26_30')
      case '31+': return t('age_31plus')
      default: return t('unknown')
    }
  }
  const orUnknown = (v: string): string => (v === 'unknown' || !v.trim() ? t('unknown') : v)
  const monthLabel = (m: string): string => m // YYYY-MM — язык-нейтрально

  return (
    <>
      {/* Верхний ряд — плитки KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatCard label={t('total_leads')} value={String(report.total_leads)} />
        <StatCard label={t('applicants')} value={String(conv.applicants)} />
        <StatCard label={t('students')} value={String(conv.students)} />
        <StatCard label={t('conversion_rate')} value={`${convRate}%`} color="var(--accent)" />
      </div>

      {/* Разбивки — карточки с горизонтальными барами */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        <BreakdownCard title={t('by_source')} empty={t('empty')}
          rows={report.by_source.map(r => ({ label: orUnknown(r.source), value: r.count }))} />
        {report.by_stage.length > 0 && (
          <BreakdownCard title={t('by_stage')} empty={t('empty')}
            rows={report.by_stage.map(r => ({ label: stageLabel(r.stage), value: r.count }))} />
        )}
        <BreakdownCard title={t('by_age')} empty={t('empty')}
          rows={report.by_age.map(r => ({ label: ageLabel(r.bucket), value: r.count }))} />
        <BreakdownCard title={t('by_country')} empty={t('empty')}
          rows={report.by_country.map(r => ({ label: orUnknown(r.country), value: r.count }))} />
        <BreakdownCard title={t('by_city')} empty={t('empty')}
          rows={report.by_city.map(r => ({ label: orUnknown(r.city), value: r.count }))} />
        <BreakdownCard title={t('by_month')} empty={t('empty')}
          rows={report.by_month.map(r => ({ label: monthLabel(r.month), value: r.count }))} />
      </div>
    </>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color ?? 'var(--text)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

/**
 * Карточка разбивки: заголовок + список «метка · значение · пропорциональный бар».
 * Бар — просто div шириной value/max, доступно (метка и число текстом рядом).
 */
function BreakdownCard({ title, rows, empty }: {
  title: string
  rows: Array<{ label: string; value: number }>
  empty: string
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ padding: '18px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{empty}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{r.value}</span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${max > 0 ? Math.round((r.value / max) * 100) : 0}%`, background: 'var(--accent)', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
