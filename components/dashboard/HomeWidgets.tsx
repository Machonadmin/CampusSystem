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
        <h2 className="text-sm font-bold text-gray-400 tracking-widest uppercase mb-4">{t('section_title')}</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: hasAny ? 24 : 0 }}>
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
      style={{
        textAlign: 'start', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
        padding: 16, cursor: 'pointer', display: 'grid', gap: 10,
        borderInlineStart: `4px solid ${accent}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{title}</span>
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
      <span style={{ color: '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{main}</span>
      {sub && <span style={{ color: '#9CA3AF', flexShrink: 0 }}>{sub}</span>}
    </div>
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
    <Card title={t('pending_signatures')} accent="#4F46E5" count={items.length} onClick={() => router.push('/dashboard/education')}>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.slice(0, 4).map(s => (
          <Row key={s.stage_instance_id}
            main={s.applicant.full_name || s.applicant.hebrew_name || '—'}
            sub={tEdu(`acceptance_stages.${s.stage_code}`, s.stage_code)} />
        ))}
        {items.length > 4 && <span style={{ fontSize: 12, color: '#4F46E5' }}>+{items.length - 4} {t('more')}</span>}
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
    <Card title={t('my_tasks')} accent="#F59E0B" count={items.length} onClick={() => router.push('/dashboard/tasks')}>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.slice(0, 4).map(tk => (
          <Row key={tk.id} main={tk.title} sub={tk.due_date ? formatDate(tk.due_date, lang) : t('no_date')} />
        ))}
        {items.length > 4 && <span style={{ fontSize: 12, color: '#B45309' }}>+{items.length - 4} {t('more')}</span>}
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
    <Card title={t('upcoming')} accent="#6366F1" count={items.length} onClick={() => router.push('/dashboard/calendar')}>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.slice(0, 4).map(ev => (
          <Row key={ev.id} main={ev.title}
            sub={`${formatDate(ev.event_date, lang)}${!ev.all_day && ev.event_time ? ' ' + ev.event_time.slice(0, 5) : ''}`} />
        ))}
        {items.length > 4 && <span style={{ fontSize: 12, color: '#6366F1' }}>+{items.length - 4} {t('more')}</span>}
      </div>
    </Card>
  )
}
