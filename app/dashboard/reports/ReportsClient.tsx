'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// ─── Типы сводок (совпадают с ответами app/api/reports/**) ───────────────────

interface StudentsSummary { total: number; by_status: Record<string, number> }
interface AdmissionFunnel {
  funnel: { leads: number; applicants: number; students: number; reached_applicant: number; reached_student: number }
  conversion: { lead_to_applicant: number; applicant_to_student: number }
  stages: { code: string; active: number; completed: number }[]
}
interface FinanceSummary {
  charged: number; collected: number; outstanding: number
  collection_rate: number; debtor_count: number
}
interface DormitorySummary {
  capacity: number; occupied: number; free: number; occupancy_percent: number
  building_count: number; room_count: number
}
interface FoodSummary { enrolled: number; unenrolled: number }
interface MaintenanceSummary {
  open: number; in_progress: number; overdue: number
  by_priority: Record<string, number>
}
interface ClinicSummary {
  open_visits: number; upcoming_followups: number; overdue_followups: number
}
interface CounselingSummary {
  open_sessions: number; upcoming_followups: number; overdue_followups: number
  by_risk: Record<string, number>
}
interface DocumentsSummary {
  total: number; active: number; expired: number; expiring_soon: number
}
interface SponsorsSummary {
  sponsor_count: number; total_received: number; total_pledged: number
}
interface SecuritySummary {
  active: number; open: number; investigating: number
  by_severity: Record<string, number>
}

// Порядок отображения ключей разбивок (остальные — по алфавиту в конце).
const STATUS_ORDER = ['student', 'applicant', 'lead', 'on_leave', 'graduated', 'expelled', 'alumni', 'lost']
const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low']
const RISK_ORDER = ['high', 'medium', 'low', 'none']
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']

function orderedEntries(obj: Record<string, number>, order: string[]): [string, number][] {
  const known = order.filter(k => k in obj).map(k => [k, obj[k]] as [string, number])
  const rest = Object.keys(obj).filter(k => !order.includes(k)).sort().map(k => [k, obj[k]] as [string, number])
  return [...known, ...rest]
}

const fmt = (n: number): string => n.toLocaleString('ru-RU')

// ─── Обобщённая карточка домена ──────────────────────────────────────────────
//
// Каждая карточка грузит свой эндпоинт НЕЗАВИСИМО (свой loading/error) — сбой
// одного домена не ломает остальные (§8 спецификации).

function ReportCard<T>({
  title, colorKey, endpoint, render, href, periodBadge,
}: {
  title: string
  colorKey: string
  endpoint: string
  render: (data: T) => ReactNode
  href?: string
  periodBadge?: string
}) {
  const tCommon = useTranslations('common')
  const t = useTranslations('reports')

  const primary = getModuleColor(colorKey, 'primary')
  const light = getModuleColor(colorKey, 'light')

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const res = await fetch(endpoint)
        if (!alive) return
        if (!res.ok) {
          const b = await res.json().catch(() => ({}))
          setError(b.error ?? t('error'))
          setData(null)
          return
        }
        const b = await res.json()
        if (!alive) return
        setData(b as T)
      } catch {
        if (alive) setError(t('error'))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [endpoint, t])

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 12,
      background: 'var(--surface)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        background: light,
        borderInlineStart: `4px solid ${primary}`,
        padding: '10px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          {href ? (
            <Link href={href} className="no-underline" style={{ fontSize: 15, fontWeight: 600, margin: 0, color: primary, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {title}
              <span style={{ fontSize: 13, opacity: 0.7 }}>‹</span>
            </Link>
          ) : (
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: primary }}>{title}</h2>
          )}
          {periodBadge && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: primary, background: 'var(--surface)', border: `1px solid ${primary}`, borderRadius: 6, padding: '1px 6px', whiteSpace: 'nowrap' }}>{periodBadge}</span>
          )}
        </div>
      </div>
      <div style={{ padding: '14px 16px', minHeight: 96 }}>
        {error ? (
          <div style={{ fontSize: 13, color: '#B91C1C', background: '#FEE2E2', borderRadius: 8, padding: '8px 10px' }}>
            {error}
          </div>
        ) : loading ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{tCommon('loading')}</div>
        ) : data ? (
          render(data)
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('empty')}</div>
        )}
      </div>
    </div>
  )
}

// ─── Строка метрики ──────────────────────────────────────────────────────────

function Metric({ label, value, strong, accent }: {
  label: string; value: string | number; strong?: boolean; accent?: string
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      gap: 12, padding: '3px 0',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontSize: strong ? 18 : 14,
        fontWeight: strong ? 700 : 500,
        color: accent ?? 'var(--text)',
      }}>{value}</span>
    </div>
  )
}

function Breakdown({ entries, labelFor }: {
  entries: [string, number][]; labelFor: (key: string) => string
}) {
  if (entries.length === 0) return null
  return (
    <div style={{ marginTop: 6, borderTop: '1px dashed var(--border)', paddingTop: 6 }}>
      {entries.map(([k, v]) => (
        <Metric key={k} label={labelFor(k)} value={fmt(v)} />
      ))}
    </div>
  )
}

// ─── Страница ────────────────────────────────────────────────────────────────

export default function ReportsClient() {
  const t = useTranslations('reports')
  const tNav = useTranslations('navigation')

  // Мягкая привязка t для вложенных ключей с фолбэком на сам ключ.
  const label = (key: string, fallback: string) => t(key, fallback)

  // Период (влияет только на денежные карточки: финансы и спонсоры).
  const [preset, setPreset] = useState<'all' | 'month' | 'year' | 'custom'>('all')
  const [cFrom, setCFrom] = useState('')
  const [cTo, setCTo] = useState('')
  const p2 = (n: number) => String(n).padStart(2, '0')
  const isoLocal = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
  let pFrom = '', pTo = ''
  if (preset === 'month') { const d = new Date(); pFrom = isoLocal(new Date(d.getFullYear(), d.getMonth(), 1)); pTo = isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0)) }
  else if (preset === 'year') { const y = new Date().getFullYear(); pFrom = `${y}-01-01`; pTo = `${y}-12-31` }
  else if (preset === 'custom') { pFrom = cFrom; pTo = cTo }
  const periodQs = (pFrom || pTo) ? `?${new URLSearchParams({ ...(pFrom ? { from: pFrom } : {}), ...(pTo ? { to: pTo } : {}) }).toString()}` : ''
  const periodActive = preset !== 'all' && !!(pFrom || pTo)
  const periodBadge = periodActive ? t('period.applies') : undefined
  const presetBtn = (key: typeof preset): React.CSSProperties => ({
    fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${preset === key ? 'var(--accent-strong)' : 'var(--border-strong)'}`,
    background: preset === key ? 'var(--accent-tint)' : 'var(--surface)',
    color: preset === key ? 'var(--accent-strong)' : 'var(--text)',
  })

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />

      {/* Заголовок модуля — зелёный акцент reports */}
      <div style={{
        background: getModuleHeaderGradient('reports'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(22,163,74,0.15)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t('subtitle')}</div>
      </div>

      {/* Период — влияет на денежные карточки (финансы, спонсоры) */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{t('period.label')}</span>
        <button onClick={() => setPreset('all')} style={presetBtn('all')}>{t('period.all')}</button>
        <button onClick={() => setPreset('month')} style={presetBtn('month')}>{t('period.month')}</button>
        <button onClick={() => setPreset('year')} style={presetBtn('year')}>{t('period.year')}</button>
        <button onClick={() => setPreset('custom')} style={presetBtn('custom')}>{t('period.custom')}</button>
        {preset === 'custom' && (
          <>
            <input type="date" value={cFrom} onChange={e => setCFrom(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' }} />
            <span style={{ color: 'var(--text-faint)' }}>–</span>
            <input type="date" value={cTo} onChange={e => setCTo(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' }} />
          </>
        )}
        <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{t('period.hint')}</span>
      </div>

      {/* Сетка карточек — каждая грузится независимо */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 16,
      }}>
        {/* Воронка приёма */}
        <ReportCard<AdmissionFunnel>
          title={t('cards.admission_funnel')}
          colorKey="education"
          endpoint="/api/reports/admission-funnel"
          href="/dashboard/education"
          render={(d) => (
            <>
              <Metric label={t('metrics.leads')} value={fmt(d.funnel.leads)} />
              <Metric label={t('metrics.applicants')} value={fmt(d.funnel.applicants)} />
              <Metric label={t('metrics.students')} value={fmt(d.funnel.students)} strong accent={getModuleColor('education', 'primary')} />
              <div style={{ marginTop: 6, borderTop: '1px dashed var(--border)', paddingTop: 6 }}>
                <Metric label={t('metrics.lead_to_applicant')} value={`${d.conversion.lead_to_applicant}%`} accent={getModuleColor('education', 'primary')} />
                <Metric label={t('metrics.applicant_to_student')} value={`${d.conversion.applicant_to_student}%`} accent={getModuleColor('education', 'primary')} />
              </div>
              {d.stages.length > 0 && (
                <div style={{ marginTop: 6, borderTop: '1px dashed var(--border)', paddingTop: 6 }}>
                  {d.stages.map(s => (
                    <Metric key={s.code} label={`${t('metrics.stage_pending')}: ${label(`metrics.stage.${s.code}`, s.code)}`} value={fmt(s.active)} accent={s.active > 0 ? '#B45309' : undefined} />
                  ))}
                </div>
              )}
            </>
          )}
        />

        {/* Студенты */}
        <ReportCard<StudentsSummary>
          title={t('cards.students')}
          colorKey="education"
          endpoint="/api/reports/students"
          href="/dashboard/education"
          render={(d) => (
            <>
              <Metric label={t('metrics.total')} value={fmt(d.total)} strong accent={getModuleColor('education', 'primary')} />
              <Breakdown
                entries={orderedEntries(d.by_status, STATUS_ORDER)}
                labelFor={(k) => label(`metrics.status.${k}`, k)}
              />
            </>
          )}
        />

        {/* Финансы */}
        <ReportCard<FinanceSummary>
          title={t('cards.finance')}
          colorKey="finance"
          endpoint={`/api/reports/finance${periodQs}`}
          href="/dashboard/finance"
          periodBadge={periodBadge}
          render={(d) => (
            <>
              <Metric label={t('metrics.charged')} value={fmt(d.charged)} />
              <Metric label={t('metrics.collected')} value={fmt(d.collected)} accent={getModuleColor('finance', 'primary')} />
              <Metric label={t('metrics.outstanding')} value={fmt(d.outstanding)} accent="#B91C1C" />
              <Metric label={t('metrics.collection_rate')} value={`${d.collection_rate}%`} strong accent={getModuleColor('finance', 'primary')} />
              <Metric label={t('metrics.debtor_count')} value={fmt(d.debtor_count)} />
            </>
          )}
        />

        {/* Общежитие */}
        <ReportCard<DormitorySummary>
          title={t('cards.dormitory')}
          colorKey="dormitory"
          endpoint="/api/reports/dormitory"
          href="/dashboard/dormitory"
          render={(d) => (
            <>
              <Metric label={t('metrics.occupancy_percent')} value={`${d.occupancy_percent}%`} strong accent={getModuleColor('dormitory', 'primary')} />
              <Metric label={t('metrics.occupied')} value={`${fmt(d.occupied)} / ${fmt(d.capacity)}`} />
              <Metric label={t('metrics.free')} value={fmt(d.free)} />
              <Metric label={t('metrics.building_count')} value={fmt(d.building_count)} />
              <Metric label={t('metrics.room_count')} value={fmt(d.room_count)} />
            </>
          )}
        />

        {/* Питание */}
        <ReportCard<FoodSummary>
          title={t('cards.food')}
          colorKey="food"
          endpoint="/api/reports/food"
          href="/dashboard/food"
          render={(d) => (
            <>
              <Metric label={t('metrics.enrolled')} value={fmt(d.enrolled)} strong accent={getModuleColor('food', 'primary')} />
              <Metric label={t('metrics.unenrolled')} value={fmt(d.unenrolled)} />
            </>
          )}
        />

        {/* Эксплуатация */}
        <ReportCard<MaintenanceSummary>
          title={t('cards.maintenance')}
          colorKey="maintenance"
          endpoint="/api/reports/maintenance"
          href="/dashboard/maintenance"
          render={(d) => (
            <>
              <Metric label={t('metrics.open')} value={fmt(d.open)} />
              <Metric label={t('metrics.in_progress')} value={fmt(d.in_progress)} />
              <Metric label={t('metrics.overdue')} value={fmt(d.overdue)} strong accent={d.overdue > 0 ? '#B91C1C' : undefined} />
              <Breakdown
                entries={orderedEntries(d.by_priority, PRIORITY_ORDER)}
                labelFor={(k) => label(`metrics.priority.${k}`, k)}
              />
            </>
          )}
        />

        {/* Медпункт */}
        <ReportCard<ClinicSummary>
          title={t('cards.clinic')}
          colorKey="doctor"
          endpoint="/api/reports/clinic"
          href="/dashboard/doctor"
          render={(d) => (
            <>
              <Metric label={t('metrics.open_visits')} value={fmt(d.open_visits)} strong accent={getModuleColor('doctor', 'primary')} />
              <Metric label={t('metrics.upcoming_followups')} value={fmt(d.upcoming_followups)} />
              <Metric label={t('metrics.overdue_followups')} value={fmt(d.overdue_followups)} accent={d.overdue_followups > 0 ? '#B91C1C' : undefined} />
            </>
          )}
        />

        {/* Психолог */}
        <ReportCard<CounselingSummary>
          title={t('cards.counseling')}
          colorKey="psychologist"
          endpoint="/api/reports/counseling"
          href="/dashboard/psychologist"
          render={(d) => (
            <>
              <Metric label={t('metrics.open_sessions')} value={fmt(d.open_sessions)} strong accent={getModuleColor('psychologist', 'primary')} />
              <Metric label={t('metrics.upcoming_followups')} value={fmt(d.upcoming_followups)} />
              <Metric label={t('metrics.overdue_followups')} value={fmt(d.overdue_followups)} accent={d.overdue_followups > 0 ? '#B91C1C' : undefined} />
              <Breakdown
                entries={orderedEntries(d.by_risk, RISK_ORDER)}
                labelFor={(k) => label(`metrics.risk.${k}`, k)}
              />
            </>
          )}
        />

        {/* Документы */}
        <ReportCard<DocumentsSummary>
          title={t('cards.documents')}
          colorKey="documents"
          endpoint="/api/reports/documents"
          href="/dashboard/documents"
          render={(d) => (
            <>
              <Metric label={t('metrics.total')} value={fmt(d.total)} strong accent={getModuleColor('documents', 'primary')} />
              <Metric label={t('metrics.expiring_soon')} value={fmt(d.expiring_soon)} accent={d.expiring_soon > 0 ? '#B45309' : undefined} />
              <Metric label={t('metrics.expired')} value={fmt(d.expired)} accent={d.expired > 0 ? '#B91C1C' : undefined} />
            </>
          )}
        />

        {/* Спонсоры */}
        <ReportCard<SponsorsSummary>
          title={t('cards.sponsors')}
          colorKey="sponsors"
          endpoint={`/api/reports/sponsors${periodQs}`}
          href="/dashboard/sponsors"
          periodBadge={periodBadge}
          render={(d) => (
            <>
              <Metric label={t('metrics.sponsor_count')} value={fmt(d.sponsor_count)} />
              <Metric label={t('metrics.total_received')} value={fmt(d.total_received)} strong accent={getModuleColor('sponsors', 'primary')} />
              <Metric label={t('metrics.total_pledged')} value={fmt(d.total_pledged)} />
            </>
          )}
        />

        {/* Безопасность */}
        <ReportCard<SecuritySummary>
          title={t('cards.security')}
          colorKey="security"
          endpoint="/api/reports/security"
          href="/dashboard/security"
          render={(d) => (
            <>
              <Metric label={t('metrics.active_incidents')} value={fmt(d.active)} strong accent={d.active > 0 ? '#B91C1C' : getModuleColor('security', 'primary')} />
              <Metric label={t('metrics.open')} value={fmt(d.open)} />
              <Metric label={t('metrics.investigating')} value={fmt(d.investigating)} />
              <Breakdown
                entries={orderedEntries(d.by_severity, SEVERITY_ORDER)}
                labelFor={(k) => label(`metrics.severity.${k}`, k)}
              />
            </>
          )}
        />
      </div>
    </div>
  )
}
