'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'

/**
 * «Что требует внимания» на главной: личные виджеты, каждый грузится сам и
 * рендерит null, если пусто. Секция целиком скрывается, когда всё пусто.
 */
export default function HomeWidgets() {
  const t = useTranslations('home')
  const [hasAny, setHasAny] = useState(false)

  return (
    <div>
      <div style={{ display: hasAny ? 'block' : 'none' }}>
        <h2 className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: 'var(--text-faint)' }}>{t('section_title')}</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: hasAny ? 24 : 0 }}>
        <MyLessonsWidget onData={() => setHasAny(true)} />
        <StalledApplicantsWidget onData={() => setHasAny(true)} />
        <PendingSignaturesWidget onData={() => setHasAny(true)} />
        <MyTasksWidget onData={() => setHasAny(true)} />
        <UpcomingEventsWidget onData={() => setHasAny(true)} />
      </div>
    </div>
  )
}

function Card({ title, accent, count, children, onClick }: {
  title: string; accent: string; count?: number; children: React.ReactNode; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="home-card"
      style={{
        textAlign: 'start', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: 16, cursor: 'pointer', display: 'grid', gap: 10, boxShadow: 'var(--shadow)',
        borderInlineStart: `4px solid ${accent}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        {count != null && count > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 9px', borderRadius: 999, background: accent, color: '#fff' }}>{count}</span>
        )}
      </div>
      {children}
    </button>
  )
}

function Row({ main, sub }: { main: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{main}</span>
      {sub && <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>{sub}</span>}
    </div>
  )
}

// ── Мои уроки сегодня (учитель) ──────────────────────────────────────────────
interface MyLesson { id: string; class_group_name: string; subject: string | null; scheduled_time: string | null; marked_count: number; enrolled_count: number; is_cancelled: boolean }
function MyLessonsWidget({ onData }: { onData: () => void }) {
  const t = useTranslations('home')
  const router = useRouter()
  const [items, setItems] = useState<MyLesson[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = new Date().toISOString().slice(0, 10)
      const res = await fetch(`/api/education/my-lessons?date=${d}`)
      if (res.ok) { const b = await res.json(); const s = (b.lessons ?? []) as MyLesson[]; setItems(s); if (s.length) onData() }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [onData])
  useEffect(() => { load() }, [load])

  if (!loaded || items.length === 0) return null
  return (
    <Card title={t('my_lessons_today')} accent="var(--accent)" count={items.length} onClick={() => router.push('/dashboard/education/my-day')}>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.slice(0, 4).map(l => (
          <Row key={l.id}
            main={`${l.class_group_name}${l.subject ? ' · ' + l.subject : ''}`}
            sub={l.is_cancelled ? '—' : (l.scheduled_time ? l.scheduled_time.slice(0, 5) : '')} />
        ))}
        {items.length > 4 && <span style={{ fontSize: 12, color: 'var(--accent-strong)' }}>+{items.length - 4} {t('more')}</span>}
      </div>
    </Card>
  )
}

// ── Застрявшие абитуриентки ──────────────────────────────────────────────────
interface Stalled {
  journey_id: string
  applicant: { full_name: string; hebrew_name: string | null }
  stages: Array<{ stage_code: string }>
  max_days: number
}
function StalledApplicantsWidget({ onData }: { onData: () => void }) {
  const t = useTranslations('home')
  const router = useRouter()
  const [items, setItems] = useState<Stalled[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/education/stalled-applicants')
      if (res.ok) { const b = await res.json(); const s = (b.applicants ?? []) as Stalled[]; setItems(s); if (s.length) onData() }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [onData])
  useEffect(() => { load() }, [load])

  if (!loaded || items.length === 0) return null
  return (
    <Card title={t('stalled')} accent="var(--danger)" count={items.length} onClick={() => router.push('/dashboard/education')}>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.slice(0, 4).map(s => (
          <Row key={s.journey_id}
            main={s.applicant.full_name || s.applicant.hebrew_name || '—'}
            sub={t('days_waiting', '{n} d').replace('{n}', String(s.max_days))} />
        ))}
        {items.length > 4 && <span style={{ fontSize: 12, color: 'var(--danger)' }}>+{items.length - 4} {t('more')}</span>}
      </div>
    </Card>
  )
}

// ── Ожидают моей подписи ─────────────────────────────────────────────────────
interface PendingStage { stage_instance_id: string; journey_id: string | null; stage_code: string; applicant: { full_name: string; hebrew_name: string | null } }
function PendingSignaturesWidget({ onData }: { onData: () => void }) {
  const t = useTranslations('home')
  const tEdu = useTranslations('education')
  const router = useRouter()
  const [items, setItems] = useState<PendingStage[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/workflow/my-pending-stages')
      if (res.ok) { const b = await res.json(); const s = b.stages ?? []; setItems(s); if (s.length) onData() }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [onData])
  useEffect(() => { load() }, [load])

  if (!loaded || items.length === 0) return null
  return (
    <Card title={t('pending_signatures')} accent="var(--accent)" count={items.length} onClick={() => router.push('/dashboard/education')}>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.slice(0, 4).map(s => (
          <Row key={s.stage_instance_id}
            main={s.applicant.full_name || s.applicant.hebrew_name || '—'}
            sub={tEdu(`acceptance_stages.${s.stage_code}`, s.stage_code)} />
        ))}
        {items.length > 4 && <span style={{ fontSize: 12, color: 'var(--accent-strong)' }}>+{items.length - 4} {t('more')}</span>}
      </div>
    </Card>
  )
}

// ── Мои задачи ───────────────────────────────────────────────────────────────
interface MyTask { id: string; title: string; due_date: string | null }
function MyTasksWidget({ onData }: { onData: () => void }) {
  const t = useTranslations('home')
  const { lang } = useLang()
  const router = useRouter()
  const [items, setItems] = useState<MyTask[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks?view=assigned&status=active')
      if (res.ok) {
        const b = await res.json()
        const tasks = (b.tasks ?? []) as MyTask[]
        // Сначала с ближайшим сроком.
        tasks.sort((a, c) => (a.due_date ?? '9999').localeCompare(c.due_date ?? '9999'))
        setItems(tasks); if (tasks.length) onData()
      }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [onData])
  useEffect(() => { load() }, [load])

  if (!loaded || items.length === 0) return null
  return (
    <Card title={t('my_tasks')} accent="var(--warn)" count={items.length} onClick={() => router.push('/dashboard/tasks')}>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.slice(0, 4).map(tk => (
          <Row key={tk.id} main={tk.title} sub={tk.due_date ? formatDate(tk.due_date, lang) : t('no_date')} />
        ))}
        {items.length > 4 && <span style={{ fontSize: 12, color: 'var(--warn)' }}>+{items.length - 4} {t('more')}</span>}
      </div>
    </Card>
  )
}

// ── Скоро в календаре ────────────────────────────────────────────────────────
interface CalEv { id: string; title: string; event_date: string; event_time: string | null; all_day: boolean }
function UpcomingEventsWidget({ onData }: { onData: () => void }) {
  const t = useTranslations('home')
  const { lang } = useLang()
  const router = useRouter()
  const [items, setItems] = useState<CalEv[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const now = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      const iso = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
      const to = new Date(now.getTime() + 14 * 86400000)
      const res = await fetch(`/api/calendar/events?from=${iso(now)}&to=${iso(to)}`)
      if (res.ok) { const b = await res.json(); const e = b.events ?? []; setItems(e); if (e.length) onData() }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [onData])
  useEffect(() => { load() }, [load])

  if (!loaded || items.length === 0) return null
  return (
    <Card title={t('upcoming')} accent="var(--violet)" count={items.length} onClick={() => router.push('/dashboard/calendar')}>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.slice(0, 4).map(ev => (
          <Row key={ev.id} main={ev.title}
            sub={`${formatDate(ev.event_date, lang)}${!ev.all_day && ev.event_time ? ' ' + ev.event_time.slice(0, 5) : ''}`} />
        ))}
        {items.length > 4 && <span style={{ fontSize: 12, color: 'var(--violet)' }}>+{items.length - 4} {t('more')}</span>}
      </div>
    </Card>
  )
}
