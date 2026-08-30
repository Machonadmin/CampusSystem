'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { formatMoney } from '@/lib/finance/money'

/**
 * KPI-полоса на главной — «командный центр»: несколько крупных чисел под
 * баннером. КАЖДЫЙ показатель грузится сам и РЕНДЕРИТ null при 403/пусто —
 * то есть полоса персонализируется по доступу без явной проверки ролей
 * (та же схема, что у виджетов «требует внимания»). Использует уже
 * существующие эндпоинты — новых запросов к БД нет.
 */
export default function HomeKpis() {
  // Сколько показателей реально отрисовалось — чтобы скрыть пустую полосу.
  const [shown, setShown] = useState(0)
  const bump = useCallback(() => setShown(n => n + 1), [])

  return (
    <div style={{ display: shown > 0 ? 'grid' : 'none', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      <DebtsKpi onShow={bump} />
      <LeadsKpi onShow={bump} />
      <StudentsKpi onShow={bump} />
      <CollectionKpi onShow={bump} />
    </div>
  )
}

// ── Одна плитка ───────────────────────────────────────────────────────────────
function Kpi({ label, value, sub, accent, onClick }: {
  label: string; value: string; sub?: string; accent: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="home-card anim-pop"
      style={{
        textAlign: 'start', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '14px 16px', cursor: 'pointer', display: 'grid', gap: 3,
        boxShadow: 'var(--shadow)', borderInlineStart: `4px solid ${accent}`,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{sub}</span>}
    </button>
  )
}

// ── Долги (finance.view): сумма положительных балансов + число должниц ────────
function DebtsKpi({ onShow }: { onShow: () => void }) {
  const t = useTranslations('home.kpi')
  const router = useRouter()
  const [data, setData] = useState<{ outstanding: number; debtors: number } | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/finance/students').then(r => r.ok ? r.json() : null).then((b: { students?: Array<{ balance: number }> } | null) => {
      if (!alive || !b?.students) return
      let outstanding = 0, debtors = 0
      for (const s of b.students) if (s.balance > 0.005) { outstanding += s.balance; debtors++ }
      setData({ outstanding, debtors })
      onShow()
    }).catch(() => {})
    return () => { alive = false }
  }, [onShow])

  if (!data) return null
  return <Kpi label={t('debts')} value={`₪${formatMoney(data.outstanding)}`}
    sub={t('debtors').replace('{n}', String(data.debtors))} accent="var(--danger)"
    onClick={() => router.push('/dashboard/finance')} />
}

// ── Лиды (view_leads): всего активных лидов ───────────────────────────────────
function LeadsKpi({ onShow }: { onShow: () => void }) {
  const t = useTranslations('home.kpi')
  const router = useRouter()
  const [n, setN] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/education/recruitment-report').then(r => r.ok ? r.json() : null).then((b: { total_leads?: number } | null) => {
      if (!alive || !b || typeof b.total_leads !== 'number') return
      setN(b.total_leads); onShow()
    }).catch(() => {})
    return () => { alive = false }
  }, [onShow])

  if (n == null) return null
  return <Kpi label={t('leads')} value={String(n)} accent="var(--violet)"
    onClick={() => router.push('/dashboard/education/recruitment')} />
}

// ── Студентки (reports.view): всего активных ──────────────────────────────────
function StudentsKpi({ onShow }: { onShow: () => void }) {
  const t = useTranslations('home.kpi')
  const router = useRouter()
  const [n, setN] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/reports/students').then(r => r.ok ? r.json() : null).then((b: { by_status?: Record<string, number> } | null) => {
      if (!alive || !b?.by_status) return
      setN(b.by_status.student ?? 0); onShow()
    }).catch(() => {})
    return () => { alive = false }
  }, [onShow])

  if (n == null) return null
  return <Kpi label={t('students')} value={String(n)} accent="var(--accent)"
    onClick={() => router.push('/dashboard/education/studies')} />
}

// ── Собираемость (reports.view): % собранного ─────────────────────────────────
function CollectionKpi({ onShow }: { onShow: () => void }) {
  const t = useTranslations('home.kpi')
  const router = useRouter()
  const [pct, setPct] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/reports/finance').then(r => r.ok ? r.json() : null).then((b: { collection_rate?: number } | null) => {
      if (!alive || !b || typeof b.collection_rate !== 'number') return
      setPct(b.collection_rate); onShow()
    }).catch(() => {})
    return () => { alive = false }
  }, [onShow])

  if (pct == null) return null
  return <Kpi label={t('collection')} value={`${pct}%`} accent="var(--success)"
    onClick={() => router.push('/dashboard/reports')} />
}
