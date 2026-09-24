'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'
import { localTodayISO, todayISO } from '@/lib/dates'
import { fetchMyActiveTasks } from '@/lib/tasks/my-active-tasks-client'
import type { WidgetId } from '@/lib/prefs/ui-prefs'
import HomeAgenda from './HomeAgenda'

/**
 * «העבודה שלי» на главной: всё, что ждёт сотрудника, в одном месте — ближайшие
 * дни, подписи, задачи, заявки техобслуживания, уроки, лиды, оповещения по
 * תלמידות, случаи отсутствия. Каждый блок
 * грузится сам и рендерит null, если пусто (или нет доступа: сервер отвечает
 * 403 → блока нет). Секция целиком скрывается, когда всё пусто.
 *
 * Какие блоки показывать и в каком порядке — личная раскладка сотрудника
 * (lib/prefs/ui-prefs.ts, настраивается в «הפרופיל שלי»).
 */
export default function HomeWidgets({ widgets }: { widgets: WidgetId[] }) {
  const t = useTranslations('home')
  const [hasAny, setHasAny] = useState(false)
  // Стабильная ссылка: блоки держат onData в зависимостях загрузки — новая
  // функция на каждый рендер перезапускала бы их запросы.
  const onData = useCallback(() => setHasAny(true), [])

  return (
    <div>
      <div style={{ display: hasAny ? 'block' : 'none' }}>
        <h2 className="text-sm font-bold tracking-widest uppercase mb-4" style={{ color: 'var(--text-faint)' }}>{t('section_title')}</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: hasAny ? 24 : 0 }}>
        {widgets.map(id => {
          switch (id) {
            // «Ближайшие дни» — во всю ширину сетки, как раньше над блоками.
            case 'agenda': return <div key={id} style={{ gridColumn: '1 / -1' }}><HomeAgenda onVisible={onData} /></div>
            case 'pending_signatures': return <PendingSignaturesWidget key={id} onData={onData} />
            case 'my_tasks': return <MyTasksWidget key={id} onData={onData} />
            case 'my_maintenance': return <MyMaintenanceWidget key={id} onData={onData} />
            case 'my_lessons': return <MyLessonsWidget key={id} onData={onData} />
            case 'recent_leads': return <RecentLeadsWidget key={id} onData={onData} />
            case 'stalled': return <StalledApplicantsWidget key={id} onData={onData} />
            case 'my_alerts': return <MyAlertsWidget key={id} onData={onData} />
            case 'my_absences': return <MyAbsencesWidget key={id} onData={onData} />
            default: return null
          }
        })}
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
        textAlign: 'start', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
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
      const d = todayISO()
      const res = await fetch(`/api/education/my-lessons?date=${d}`)
      if (res.ok) { const b = await res.json(); const s = (b.lessons ?? []) as MyLesson[]; setItems(s); if (s.length) onData() }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [onData])
  useEffect(() => { load() }, [load])

  if (!loaded || items.length === 0) return null
  return (
    <Card title={t('my_lessons_today')} accent="var(--accent)" count={items.length} onClick={() => router.push('/dashboard/calendar')}>
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

// ── Недавние лиды (гиюс) ─────────────────────────────────────────────────────
// Ответ на жалобу владельца: аккаунт гиюса на телефоне «почти ничего не видит»
// — на главной не было НИ ОДНОГО виджета про лидов. 403 (нет view_leads) → null.
interface RecentLead { profile_id: string; full_name: string; hebrew_name: string | null; application_date: string | null }
function RecentLeadsWidget({ onData }: { onData: () => void }) {
  const t = useTranslations('home')
  const { lang } = useLang()
  const router = useRouter()
  const [items, setItems] = useState<RecentLead[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/education/leads?process_status=active')
      if (res.ok) {
        const b = await res.json()
        const s = (Array.isArray(b) ? b : []) as RecentLead[]
        setItems(s)
        if (s.length) onData()
      }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [onData])
  useEffect(() => { load() }, [load])

  if (!loaded || items.length === 0) return null
  return (
    <Card title={t('recent_leads')} accent="var(--violet)" count={items.length} onClick={() => router.push('/dashboard/education/recruitment')}>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.slice(0, 4).map(l => (
          <Row key={l.profile_id}
            main={l.hebrew_name || l.full_name || '—'}
            sub={l.application_date ? formatDate(l.application_date, lang) : ''} />
        ))}
        {items.length > 4 && <span style={{ fontSize: 12, color: 'var(--violet)' }}>+{items.length - 4} {t('more')}</span>}
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
    // Застрявшие — это АБИТУРИЕНТКИ в приёмке, ведём на доску קבלה (раньше
    // вело в список лидов, где их структурно нет).
    <Card title={t('stalled')} accent="var(--danger)" count={items.length} onClick={() => router.push('/dashboard/education/admission')}>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.slice(0, 4).map(s => (
          <Row key={s.journey_id}
            main={s.applicant.hebrew_name || s.applicant.full_name || '—'}
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
    <Card title={t('pending_signatures')} accent="var(--accent)" count={items.length} onClick={() => router.push('/dashboard/education/admission')}>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.slice(0, 4).map(s => (
          <Row key={s.stage_instance_id}
            main={s.applicant.hebrew_name || s.applicant.full_name || '—'}
            sub={tEdu(`acceptance_stages.${s.stage_code}`, s.stage_code)} />
        ))}
        {items.length > 4 && <span style={{ fontSize: 12, color: 'var(--accent-strong)' }}>+{items.length - 4} {t('more')}</span>}
      </div>
    </Card>
  )
}

// ── Мои задачи ───────────────────────────────────────────────────────────────
type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
interface MyTask {
  id: string; title: string; due_date: string | null; due_time?: string | null; priority?: TaskPriority
  // Метка «תלמידה קשורה» — имя показывается в строке.
  student?: { name: string } | null
}

const TASK_PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: '#DC2626', high: '#D97706', normal: 'var(--accent-strong)', low: 'var(--text-faint)',
}

function MyTasksWidget({ onData }: { onData: () => void }) {
  const t = useTranslations('home')
  const { lang } = useLang()
  const router = useRouter()
  const [items, setItems] = useState<MyTask[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const tasks = await fetchMyActiveTasks()
      if (tasks) {
        // Сначала с ближайшим сроком (копия: общий кэш не мутируем).
        const sorted = [...tasks].sort((a, c) => (a.due_date ?? '9999').localeCompare(c.due_date ?? '9999')) as MyTask[]
        setItems(sorted); if (sorted.length) onData()
      }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [onData])
  useEffect(() => { load() }, [load])

  if (!loaded || items.length === 0) return null
  const today = localTodayISO()
  return (
    <Card title={t('my_tasks')} accent="var(--warn)" count={items.length} onClick={() => router.push('/dashboard/tasks')}>
      <div style={{ display: 'grid', gap: 7 }}>
        {items.slice(0, 4).map(tk => {
          const overdue = tk.due_date != null && tk.due_date < today
          const isToday = tk.due_date === today
          const dueColor = overdue ? 'var(--danger, #DC2626)' : isToday ? 'var(--warn)' : 'var(--text-faint)'
          const dueLabel = tk.due_date
            ? (isToday ? t('today', 'היום') : formatDate(tk.due_date, lang)) + (tk.due_time ? ` · ${tk.due_time.slice(0, 5)}` : '')
            : t('no_date')
          return (
            <div key={tk.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: TASK_PRIORITY_COLOR[tk.priority ?? 'normal'] }} />
              <span style={{ flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: overdue ? 600 : 400 }}>{tk.title}</span>
              {tk.student?.name && (
                <span style={{ flexShrink: 1, minWidth: 0, maxWidth: 110, fontSize: 11, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--accent-tint)', borderRadius: 8, padding: '1px 7px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tk.student.name}
                </span>
              )}
              <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: overdue || isToday ? 700 : 500, color: dueColor }}>{dueLabel}</span>
            </div>
          )
        })}
        {items.length > 4 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--warn)' }}>+{items.length - 4} {t('more')}</span>}
      </div>
    </Card>
  )
}

// ── Мои заявки техобслуживания (назначены на меня, не закрыты) ───────────────
// Без права maintenance.view сервер отвечает 403 → блока нет.
interface MyTicket { id: string; title: string; status: string; priority: 'low' | 'normal' | 'high' | 'urgent'; is_overdue?: boolean; building_name?: string | null; room_number?: string | null; location_text?: string | null }
const OPEN_TICKET = new Set(['open', 'in_progress'])
function MyMaintenanceWidget({ onData }: { onData: () => void }) {
  const t = useTranslations('home')
  const router = useRouter()
  const [items, setItems] = useState<MyTicket[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/maintenance/requests?assigned=me&page_size=100')
      if (res.ok) {
        const b = await res.json()
        // Порядок сервера сохраняем: срочные выше, затем старые.
        const s = ((b.requests ?? []) as MyTicket[]).filter(r => OPEN_TICKET.has(r.status))
        setItems(s); if (s.length) onData()
      }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [onData])
  useEffect(() => { load() }, [load])

  if (!loaded || items.length === 0) return null
  return (
    <Card title={t('my_maintenance')} accent="var(--warn)" count={items.length} onClick={() => router.push('/dashboard/maintenance')}>
      <div style={{ display: 'grid', gap: 7 }}>
        {items.slice(0, 4).map(r => {
          const where = [r.building_name, r.room_number].filter(Boolean).join(' · ') || r.location_text || ''
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: TASK_PRIORITY_COLOR[r.priority] ?? 'var(--text-faint)' }} />
              <span style={{ flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: r.is_overdue ? 600 : 400 }}>{r.title}</span>
              {where && <span style={{ flexShrink: 0, fontSize: 11.5, color: r.is_overdue ? 'var(--danger, #DC2626)' : 'var(--text-faint)' }}>{where}</span>}
            </div>
          )
        })}
        {items.length > 4 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--warn)' }}>+{items.length - 4} {t('more')}</span>}
      </div>
    </Card>
  )
}

// ── Открытые оповещения по תלמידות (только для обрабатывающих) ──────────────
// Решение владельца: блок видят ТОЛЬКО те, кто обрабатывает оповещения
// (manage_alerts). ?handler=1 → сервер отвечает 403 всем остальным, и блока нет.
// state=open — все незакрытые (state<>'closed'). Чувствительные оповещения
// сервер отдаёт только при view_sensitive_alerts.
interface MyAlert {
  id: string; title: string | null; severity: string; state: string
  student: { full_name: string | null; hebrew_name: string | null } | null
}
const ALERT_SEVERITY_COLOR: Record<string, string> = {
  critical: 'var(--danger, #DC2626)', warning: 'var(--warn)', info: 'var(--text-faint)',
}
function MyAlertsWidget({ onData }: { onData: () => void }) {
  const t = useTranslations('home')
  const tAlerts = useTranslations('education.alerts')
  const router = useRouter()
  const [items, setItems] = useState<MyAlert[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/education/alerts?state=open&handler=1')
      if (res.ok) { const b = await res.json(); const s = (b.alerts ?? []) as MyAlert[]; setItems(s); if (s.length) onData() }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [onData])
  useEffect(() => { load() }, [load])

  if (!loaded || items.length === 0) return null
  return (
    <Card title={t('my_alerts')} accent="var(--danger)" count={items.length} onClick={() => router.push('/dashboard/education/alerts')}>
      <div style={{ display: 'grid', gap: 7 }}>
        {items.slice(0, 4).map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: ALERT_SEVERITY_COLOR[a.severity] ?? 'var(--text-faint)' }} />
            <span style={{ flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.student?.hebrew_name || a.student?.full_name || '—'}{a.title ? ` · ${a.title}` : ''}
            </span>
            <span style={{ flexShrink: 0, fontSize: 11.5, color: 'var(--text-faint)' }}>{tAlerts(`state_${a.state}`, a.state)}</span>
          </div>
        ))}
        {items.length > 4 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)' }}>+{items.length - 4} {t('more')}</span>}
      </div>
    </Card>
  )
}

// ── Случаи отсутствия (менеджер — все, остальные — переданные их подразделениям) ─
// Видимость решает сервер (GET /api/education/absences); 403 → блока нет.
interface MyAbsence { id: string; student_name: string; absence_date: string | null; status: string; department_name: string | null }
function MyAbsencesWidget({ onData }: { onData: () => void }) {
  const t = useTranslations('home')
  const tAbs = useTranslations('education.absences')
  const { lang } = useLang()
  const router = useRouter()
  const [items, setItems] = useState<MyAbsence[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      // «Открытые» = все нерешённые: open (ещё не передан) + in_handling (передан подразделению).
      const [rOpen, rHandling] = await Promise.all([
        fetch('/api/education/absences?status=open'),
        fetch('/api/education/absences?status=in_handling'),
      ])
      if (rOpen.ok || rHandling.ok) {
        const s: MyAbsence[] = []
        for (const r of [rOpen, rHandling]) if (r.ok) { const b = await r.json(); s.push(...((b.items ?? []) as MyAbsence[])) }
        setItems(s); if (s.length) onData()
      }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [onData])
  useEffect(() => { load() }, [load])

  if (!loaded || items.length === 0) return null
  return (
    <Card title={t('my_absences')} accent="var(--warn)" count={items.length} onClick={() => router.push('/dashboard/education/absences')}>
      <div style={{ display: 'grid', gap: 5 }}>
        {items.slice(0, 4).map(c => (
          <Row key={c.id}
            main={c.student_name || '—'}
            sub={c.absence_date ? formatDate(c.absence_date, lang) : tAbs(`status_${c.status}`, c.status)} />
        ))}
        {items.length > 4 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--warn)' }}>+{items.length - 4} {t('more')}</span>}
      </div>
    </Card>
  )
}
