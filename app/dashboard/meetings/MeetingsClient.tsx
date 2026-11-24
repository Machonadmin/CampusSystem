'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { PersonSelect } from '@/components/ui/person-select'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { minutesToHHmm } from '@/lib/meetings/rules'
import {
  PEOPLE_SOURCE, card, label, input, muted, sectionTitle, tabBtn, send, isoDate, isoTime,
  todayLocal, addDays, PeoplePicker, type PersonRef,
} from './meetings-ui'
import ContactsTab from './ContactsTab'

// ── Типы ответа API ──────────────────────────────────────────────────────────

interface Context {
  migrated: boolean
  me: PersonRef
  calendars: Array<{ owner_id: string; name: string; role: 'owner' | 'delegate' }>
  my_delegates: PersonRef[]
  request_targets: PersonRef[]
  is_superadmin: boolean
  contacts: boolean
}

interface MeetingItem {
  id: string
  title: string
  starts_at: string
  ends_at: string
  status: string
  attendees: Array<{ person_id: string; name: string; status: string }>
  student: { journey_id: string; name: string } | null
  can_see_content: boolean
}

interface DayInfo {
  blocked: boolean
  busy: Array<{ start: number; end: number; kind: 'meeting' | 'lesson' }>
  free: Array<[number, number]>
}

interface RequestItem {
  id: string
  owner_id: string
  owner_name: string
  requester_name: string
  from_student: boolean
  subject: string
  details: string | null
  preferred_times: string | null
  status: string
  proposed_starts_at: string | null
  proposed_ends_at: string | null
  response_note: string | null
  appointment_id: string | null
  handled_by_name: string | null
  created_at: string
}

type Tab = 'calendar' | 'contacts' | 'requests' | 'tasks' | 'my_requests' | 'shared' | 'settings'

const STATUS_TONE: Record<string, BadgeTone> = {
  scheduled: 'info', completed: 'success', cancelled: 'neutral', no_show: 'warn',
  pending: 'warn', approved: 'success', declined: 'danger', proposed: 'info',
}

export default function MeetingsClient() {
  const t = useTranslations('meetings_mgr')
  const params = useSearchParams()
  const router = useRouter()
  const [ctx, setCtx] = useState<Context | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    fetch('/api/meetings/context', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setCtx)
      .catch(() => setFailed(true))
  }, [])

  // Кто «ведёт календарь»: владелец с секретарём, сама секретарь, или superadmin.
  const manages = !!ctx && (ctx.calendars.length > 1 || ctx.my_delegates.length > 0)
  const tabs = useMemo<Tab[]>(() => {
    if (!ctx) return []
    const out: Tab[] = []
    if (manages) out.push('calendar')
    if (ctx.contacts) out.push('contacts')
    if (manages) out.push('requests', 'tasks')
    if (ctx.request_targets.length > 0) out.push('my_requests')
    out.push('shared')
    if (manages || ctx.is_superadmin) out.push('settings')
    return out
  }, [ctx, manages])

  const requested = params.get('tab') as Tab | null
  const tab: Tab | null = tabs.length === 0 ? null : (requested && tabs.includes(requested) ? requested : tabs[0])
  const setTab = (x: Tab) => router.replace(`/dashboard/meetings?tab=${x}`, { scroll: false })

  return (
    <div className="p-4 md:p-6" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <ModuleHeader module="dashboard" title={t('title')} subtitle={t('subtitle')} />
      {failed && <p style={{ color: 'var(--danger)', fontSize: 14, margin: 0 }}>{t('load_error')}</p>}
      {!failed && !ctx && <Skeleton height={120} />}
      {ctx && !ctx.migrated && <div style={card}><p style={{ margin: 0, fontSize: 14 }}>{t('not_migrated')}</p></div>}
      {ctx && ctx.migrated && tab && (
        <>
          <div role="tablist" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
            {tabs.map(x => (
              <button key={x} type="button" role="tab" aria-selected={tab === x} style={tabBtn(tab === x)} onClick={() => setTab(x)}>
                {t(`tab_${x}`)}
              </button>
            ))}
          </div>
          {tab === 'calendar' && <CalendarTab ctx={ctx} />}
          {tab === 'contacts' && <ContactsTab />}
          {tab === 'requests' && <RequestsTab ctx={ctx} />}
          {tab === 'tasks' && <TasksTab ctx={ctx} />}
          {tab === 'my_requests' && <MyRequestsTab ctx={ctx} />}
          {tab === 'shared' && <SharedTab />}
          {tab === 'settings' && <SettingsTab ctx={ctx} />}
        </>
      )}
    </div>
  )
}

// ── Выбор календаря (свой / который веду) ────────────────────────────────────

function CalendarPicker({ ctx, value, onChange }: { ctx: Context; value: string; onChange: (id: string) => void }) {
  const t = useTranslations('meetings_mgr')
  if (ctx.calendars.length < 2) return null
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{t('calendar_of')}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...input, width: 'auto' }}>
        {ctx.calendars.map(c => (
          <option key={c.owner_id} value={c.owner_id}>{c.role === 'owner' ? t('my_calendar') : c.name}</option>
        ))}
      </select>
    </label>
  )
}

/** По умолчанию секретарь открывает календарь того, кого ведёт, а не свой. */
function defaultOwner(ctx: Context): string {
  return ctx.calendars.find(c => c.role === 'delegate')?.owner_id ?? ctx.me.id
}

// ═════════════════════════════════════════════════════════════════════════════
// יומן: свободные окна дня + встречи + קביעת פגישה
// ═════════════════════════════════════════════════════════════════════════════

function CalendarTab({ ctx }: { ctx: Context }) {
  const t = useTranslations('meetings_mgr')
  const { lang } = useLang()
  const [owner, setOwner] = useState(defaultOwner(ctx))
  const [day, setDay] = useState(todayLocal())
  const [meetings, setMeetings] = useState<MeetingItem[] | null>(null)
  const [dayInfo, setDayInfo] = useState<DayInfo | null>(null)
  const params = useSearchParams()
  // Из ספר אנשי קשר: «קבע פגישה» с этим человеком (?with=<id>&wname=<имя>).
  const withId = params.get('with')
  const withName = params.get('wname') ?? ''
  const [booking, setBooking] = useState<{ start: string; end: string; people?: PersonRef[] } | null>(
    withId ? { start: '09:00', end: '09:30', people: [{ id: withId, name: withName }] } : null,
  )

  const load = useCallback(async () => {
    setMeetings(null)
    const r = await fetch(`/api/meetings/calendar?owner=${owner}&from=${day}&to=${addDays(day, 13)}&day=${day}`, { cache: 'no-store' })
    if (!r.ok) { setMeetings([]); toastError(t('load_error')); return }
    const b = await r.json()
    setMeetings(b.meetings ?? [])
    setDayInfo(b.day ?? null)
  }, [owner, day, t])
  useEffect(() => { load() }, [load])

  const byDay = useMemo(() => {
    const m = new Map<string, MeetingItem[]>()
    for (const x of meetings ?? []) {
      const d = isoDate(x.starts_at)
      m.set(d, [...(m.get(d) ?? []), x])
    }
    return [...m.entries()]
  }, [meetings])

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <CalendarPicker ctx={ctx} value={owner} onChange={setOwner} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Button size="sm" onClick={() => setDay(addDays(day, -1))} aria-label={t('prev_day')}>‹</Button>
          <input type="date" value={day} onChange={e => e.target.value && setDay(e.target.value)} style={{ ...input, width: 'auto' }} />
          <Button size="sm" onClick={() => setDay(addDays(day, 1))} aria-label={t('next_day')}>›</Button>
          <Button size="sm" variant="ghost" onClick={() => setDay(todayLocal())}>{t('today')}</Button>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="primary" onClick={() => setBooking({ start: '09:00', end: '09:30' })}>{t('new_meeting')}</Button>
      </div>

      <div style={card}>
        <h3 style={sectionTitle}>{t('free_times')} · {formatDate(day, lang)}</h3>
        {!dayInfo ? <Skeleton height={36} /> : dayInfo.blocked ? (
          <div style={muted}>{t('day_blocked')}</div>
        ) : dayInfo.free.length === 0 ? (
          <div style={muted}>{t('no_free_times')}</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {dayInfo.free.map(([s, e]) => (
              <button key={s} type="button" onClick={() => setBooking({ start: minutesToHHmm(s), end: minutesToHHmm(Math.min(s + 30, e)) })}
                title={t('book_here')}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--success)', background: 'var(--success-tint)', color: 'var(--success)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {minutesToHHmm(s)}–{minutesToHHmm(e)}
              </button>
            ))}
          </div>
        )}
        {dayInfo && dayInfo.busy.some(b => b.kind === 'lesson') && (
          <div style={{ ...muted, marginTop: 8 }}>
            {t('lessons_today')}: {dayInfo.busy.filter(b => b.kind === 'lesson').map(b => `${minutesToHHmm(b.start)}–${minutesToHHmm(b.end)}`).join(', ')}
          </div>
        )}
      </div>

      <div>
        <h3 style={sectionTitle}>{t('upcoming')}</h3>
        {meetings === null ? <Skeleton height={100} /> : byDay.length === 0 ? <EmptyState text={t('no_meetings')} /> : (
          <div style={{ display: 'grid', gap: 12 }}>
            {byDay.map(([d, list]) => (
              <div key={d}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>{formatDate(d, lang)}</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {list.map(m => <MeetingRow key={m.id} m={m} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {booking && (
        <BookModal ownerId={owner} day={day} initial={booking} onClose={() => setBooking(null)} onDone={() => { setBooking(null); load() }} />
      )}
    </div>
  )
}

function MeetingRow({ m }: { m: MeetingItem }) {
  const t = useTranslations('meetings_mgr')
  const who = [m.student?.name, ...m.attendees.map(a => a.name)].filter(Boolean).join(', ')
  return (
    <Link href={`/dashboard/meetings/${m.id}`} style={{ ...card, display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none', color: 'var(--text)', padding: 12 }}>
      <div style={{ minWidth: 92, fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{isoTime(m.starts_at)}–{isoTime(m.ends_at)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{m.title}</div>
        <div style={{ ...muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who || t('no_attendees')}</div>
      </div>
      {m.status !== 'scheduled' && <Badge dot tone={STATUS_TONE[m.status] ?? 'neutral'} label={t(`status_${m.status}`)} />}
    </Link>
  )
}

function BookModal({ ownerId, day, initial, onClose, onDone }: {
  ownerId: string; day: string; initial: { start: string; end: string; people?: PersonRef[] }; onClose: () => void; onDone: () => void
}) {
  const t = useTranslations('meetings_mgr')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(day)
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [people, setPeople] = useState<PersonRef[]>(initial.people ?? [])
  const [prep, setPrep] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!title.trim()) { toastError(t('err_subject')); return }
    if (end <= start) { toastError(t('err_time')); return }
    setBusy(true)
    const r = await send('/api/meetings/calendar', 'POST', {
      owner_id: ownerId, title, starts_at: `${date}T${start}`, ends_at: `${date}T${end}`,
      attendee_person_ids: people.map(p => p.id), prep_notes: prep,
    })
    setBusy(false)
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    toastSuccess(t('meeting_booked'))
    onDone()
  }

  return (
    <Modal onClose={onClose} title={t('new_meeting')} maxWidth={520}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="primary" disabled={busy} onClick={save}>{t('save')}</Button>
      </div>}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div><span style={label}>{t('subject')}</span><input style={input} value={title} onChange={e => setTitle(e.target.value)} maxLength={300} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 8 }}>
          <div><span style={label}>{t('date')}</span><input type="date" style={input} value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><span style={label}>{t('from')}</span><input type="time" style={input} value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><span style={label}>{t('to')}</span><input type="time" style={input} value={end} onChange={e => setEnd(e.target.value)} /></div>
        </div>
        <div><span style={label}>{t('participants')}</span><PeoplePicker value={people} onChange={setPeople} placeholder={t('add_participant')} /></div>
        <div><span style={label}>{t('prep_notes')}</span><textarea style={{ ...input, minHeight: 70 }} value={prep} onChange={e => setPrep(e.target.value)} placeholder={t('prep_notes_hint')} /></div>
        <div style={muted}>{t('overlap_note')}</div>
      </div>
    </Modal>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// בקשות לפגישה (входящие): אישור / דחייה / הצעת מועד אחר
// ═════════════════════════════════════════════════════════════════════════════

function RequestsTab({ ctx }: { ctx: Context }) {
  const t = useTranslations('meetings_mgr')
  const { lang } = useLang()
  const [list, setList] = useState<RequestItem[] | null>(null)
  const [acting, setActing] = useState<{ r: RequestItem; action: 'approve' | 'propose' | 'decline' } | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/meetings/requests', { cache: 'no-store' })
    if (!r.ok) { setList([]); return }
    setList((await r.json()).incoming ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const open = (list ?? []).filter(r => r.status === 'pending' || r.status === 'proposed')
  const closed = (list ?? []).filter(r => !(r.status === 'pending' || r.status === 'proposed'))
  const multi = ctx.calendars.length > 1

  function renderReq(r: RequestItem) {
    return (
      <div key={r.id} style={card}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, flex: 1, minWidth: 180 }}>{r.subject}</div>
          <Badge dot tone={STATUS_TONE[r.status] ?? 'neutral'} label={t(`req_status_${r.status}`)} />
        </div>
        <div style={{ ...muted, marginTop: 4 }}>
          {r.requester_name} · {r.from_student ? t('from_student') : t('from_staff')} · {formatDate(isoDate(r.created_at), lang)}
          {multi ? ` · ${t('to_calendar')} ${r.owner_name}` : ''}
        </div>
        {r.details && <p style={{ fontSize: 13, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{r.details}</p>}
        {r.preferred_times && <p style={{ fontSize: 13, margin: '6px 0 0' }}><b>{t('preferred_times')}:</b> {r.preferred_times}</p>}
        {r.status === 'proposed' && r.proposed_starts_at && (
          <p style={{ fontSize: 13, margin: '6px 0 0' }}>
            <b>{t('proposed_time')}:</b> {formatDate(isoDate(r.proposed_starts_at), lang)} {isoTime(r.proposed_starts_at)}–{isoTime(r.proposed_ends_at)} · {t('waiting_requester')}
          </p>
        )}
        {r.response_note && <p style={{ ...muted, margin: '6px 0 0' }}>{t('response_note')}: {r.response_note}</p>}
        {r.handled_by_name && <p style={{ ...muted, margin: '4px 0 0' }}>{t('handled_by')}: {r.handled_by_name}</p>}
        {r.appointment_id && <Link href={`/dashboard/meetings/${r.appointment_id}`} style={{ fontSize: 13, display: 'inline-block', marginTop: 6 }}>{t('open_meeting')}</Link>}
        {(r.status === 'pending' || r.status === 'proposed') && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Button size="sm" variant="primary" onClick={() => setActing({ r, action: 'approve' })}>{t('approve')}</Button>
            <Button size="sm" onClick={() => setActing({ r, action: 'propose' })}>{t('propose')}</Button>
            <Button size="sm" variant="danger" onClick={() => setActing({ r, action: 'decline' })}>{t('decline')}</Button>
          </div>
        )}
      </div>
    )
  }

  if (list === null) return <Skeleton height={120} />
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {open.length === 0 ? <EmptyState text={t('no_open_requests')} /> : open.map(renderReq)}
      {closed.length > 0 && (
        <>
          <button type="button" onClick={() => setShowClosed(!showClosed)} style={{ ...muted, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'start', padding: 0 }}>
            {showClosed ? '▴' : '▾'} {t('closed_requests')} ({closed.length})
          </button>
          {showClosed && closed.map(renderReq)}
        </>
      )}
      {acting && <RequestActionModal req={acting.r} action={acting.action} onClose={() => setActing(null)} onDone={() => { setActing(null); load() }} />}
    </div>
  )
}

function RequestActionModal({ req, action, onClose, onDone }: {
  req: RequestItem; action: 'approve' | 'propose' | 'decline'; onClose: () => void; onDone: () => void
}) {
  const t = useTranslations('meetings_mgr')
  const [date, setDate] = useState(req.proposed_starts_at ? isoDate(req.proposed_starts_at) : todayLocal())
  const [start, setStart] = useState(req.proposed_starts_at ? isoTime(req.proposed_starts_at) : '09:00')
  const [end, setEnd] = useState(req.proposed_ends_at ? isoTime(req.proposed_ends_at) : '09:30')
  const [note, setNote] = useState('')
  const [free, setFree] = useState<DayInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const needsTime = action !== 'decline'

  useEffect(() => {
    if (!needsTime || !date) return
    fetch(`/api/meetings/calendar?owner=${req.owner_id}&from=${date}&to=${date}&day=${date}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null)).then(b => setFree(b?.day ?? null)).catch(() => setFree(null))
  }, [date, needsTime, req.owner_id])

  async function save() {
    if (needsTime && end <= start) { toastError(t('err_time')); return }
    setBusy(true)
    const r = await send(`/api/meetings/requests/${req.id}`, 'PATCH', {
      action, note, ...(needsTime ? { starts_at: `${date}T${start}`, ends_at: `${date}T${end}` } : {}),
    })
    setBusy(false)
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    toastSuccess(t(`done_${action}`))
    onDone()
  }

  return (
    <Modal onClose={onClose} title={`${t(action)} · ${req.subject}`} maxWidth={500}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant={action === 'decline' ? 'danger' : 'primary'} disabled={busy} onClick={save}>{t(action)}</Button>
      </div>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {needsTime && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 8 }}>
              <div><span style={label}>{t('date')}</span><input type="date" style={input} value={date} onChange={e => setDate(e.target.value)} /></div>
              <div><span style={label}>{t('from')}</span><input type="time" style={input} value={start} onChange={e => setStart(e.target.value)} /></div>
              <div><span style={label}>{t('to')}</span><input type="time" style={input} value={end} onChange={e => setEnd(e.target.value)} /></div>
            </div>
            {free && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={muted}>{t('free_times')}:</span>
                {free.blocked ? <span style={muted}>{t('day_blocked')}</span> : free.free.length === 0 ? <span style={muted}>{t('no_free_times')}</span> :
                  free.free.map(([s, e]) => (
                    <button key={s} type="button" onClick={() => { setStart(minutesToHHmm(s)); setEnd(minutesToHHmm(Math.min(s + 30, e))) }}
                      style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--success)', background: 'var(--success-tint)', color: 'var(--success)', fontSize: 12, cursor: 'pointer' }}>
                      {minutesToHHmm(s)}–{minutesToHHmm(e)}
                    </button>
                  ))}
              </div>
            )}
          </>
        )}
        <div><span style={label}>{action === 'decline' ? t('decline_reason') : t('note_to_requester')}</span>
          <textarea style={{ ...input, minHeight: 60 }} value={note} onChange={e => setNote(e.target.value)} maxLength={2000} /></div>
        {action === 'propose' && <div style={muted}>{t('propose_hint')}</div>}
      </div>
    </Modal>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// מעקב משימות
// ═════════════════════════════════════════════════════════════════════════════

interface TrackedTask {
  item_id: string; task_id: string | null; kind: string; text: string; assignee_name: string
  due_date: string | null; status: string; meeting_id: string; meeting_title: string; meeting_starts_at: string | null
}

const OPEN_TASK = new Set(['unassigned', 'pending', 'in_progress', 'review'])

function TasksTab({ ctx }: { ctx: Context }) {
  const t = useTranslations('meetings_mgr')
  const { lang } = useLang()
  const [owner, setOwner] = useState(defaultOwner(ctx))
  const [list, setList] = useState<TrackedTask[] | null>(null)
  const [filter, setFilter] = useState<'open' | 'all'>('open')

  useEffect(() => {
    setList(null)
    fetch(`/api/meetings/tasks?owner=${owner}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { tasks: [] })).then(b => setList(b.tasks ?? [])).catch(() => setList([]))
  }, [owner])

  const today = todayLocal()
  const shown = (list ?? []).filter(x => filter === 'all' || OPEN_TASK.has(x.status))

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <CalendarPicker ctx={ctx} value={owner} onChange={setOwner} />
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={tabBtn(filter === 'open')} onClick={() => setFilter('open')}>{t('tasks_open')}</button>
          <button type="button" style={tabBtn(filter === 'all')} onClick={() => setFilter('all')}>{t('tasks_all')}</button>
        </div>
      </div>
      {list === null ? <Skeleton height={100} /> : shown.length === 0 ? <EmptyState text={t('no_tasks')} /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {shown.map(x => {
            const overdue = !!x.due_date && x.due_date < today && OPEN_TASK.has(x.status)
            return (
              <div key={x.item_id} style={{ ...card, padding: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {x.task_id ? <Link href={`/dashboard/tasks/${x.task_id}`} style={{ color: 'var(--text)' }}>{x.text}</Link> : x.text}
                  </div>
                  <div style={muted}>
                    {x.assignee_name} · <Link href={`/dashboard/meetings/${x.meeting_id}`}>{x.meeting_title}</Link>
                    {x.meeting_starts_at ? ` (${formatDate(isoDate(x.meeting_starts_at), lang)})` : ''}
                  </div>
                </div>
                {x.due_date && (
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: overdue ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {overdue ? `${t('overdue')} · ` : ''}{formatDate(x.due_date, lang)}
                  </span>
                )}
                <Badge dot tone={x.status === 'completed' ? 'success' : overdue ? 'danger' : OPEN_TASK.has(x.status) ? 'info' : 'neutral'} label={t(`task_status_${x.status}`)} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// הבקשות שלי (сотрудник просит встречу)
// ═════════════════════════════════════════════════════════════════════════════

function MyRequestsTab({ ctx }: { ctx: Context }) {
  const t = useTranslations('meetings_mgr')
  const { lang } = useLang()
  const [list, setList] = useState<RequestItem[] | null>(null)
  const [owner, setOwner] = useState(ctx.request_targets[0]?.id ?? '')
  const [subject, setSubject] = useState('')
  const [details, setDetails] = useState('')
  const [preferred, setPreferred] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/meetings/requests', { cache: 'no-store' })
    setList(r.ok ? (await r.json()).mine ?? [] : [])
  }, [])
  useEffect(() => { load() }, [load])

  async function submit() {
    if (!subject.trim()) { toastError(t('err_subject')); return }
    setBusy(true)
    const r = await send('/api/meetings/requests', 'POST', { owner_id: owner, subject, details, preferred_times: preferred })
    setBusy(false)
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    toastSuccess(t('request_sent'))
    setSubject(''); setDetails(''); setPreferred('')
    load()
  }

  async function act(id: string, action: string) {
    const r = await send(`/api/meetings/requests/${id}`, 'PATCH', { action })
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    load()
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={card}>
        <h3 style={sectionTitle}>{t('new_request')}</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {ctx.request_targets.length > 1 && (
            <div><span style={label}>{t('request_to')}</span>
              <select style={input} value={owner} onChange={e => setOwner(e.target.value)}>
                {ctx.request_targets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
          )}
          <div><span style={label}>{t('subject')}</span><input style={input} value={subject} onChange={e => setSubject(e.target.value)} maxLength={300} /></div>
          <div><span style={label}>{t('details')}</span><textarea style={{ ...input, minHeight: 60 }} value={details} onChange={e => setDetails(e.target.value)} maxLength={4000} /></div>
          <div><span style={label}>{t('preferred_times')}</span><input style={input} value={preferred} onChange={e => setPreferred(e.target.value)} placeholder={t('preferred_times_hint')} maxLength={500} /></div>
          <div><Button variant="primary" disabled={busy} onClick={submit}>{t('send_request')}</Button></div>
        </div>
      </div>

      <h3 style={{ ...sectionTitle, margin: 0 }}>{t('my_requests')}</h3>
      {list === null ? <Skeleton height={80} /> : list.length === 0 ? <EmptyState text={t('no_my_requests')} /> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {list.map(r => (
            <div key={r.id} style={{ ...card, padding: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{r.subject}</div>
                <Badge dot tone={STATUS_TONE[r.status] ?? 'neutral'} label={t(`req_status_${r.status}`)} />
              </div>
              <div style={muted}>{t('request_to')} {r.owner_name} · {formatDate(isoDate(r.created_at), lang)}</div>
              {r.status === 'proposed' && r.proposed_starts_at && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13 }}><b>{t('proposed_time')}:</b> {formatDate(isoDate(r.proposed_starts_at), lang)} {isoTime(r.proposed_starts_at)}–{isoTime(r.proposed_ends_at)}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <Button size="sm" variant="primary" onClick={() => act(r.id, 'accept_proposal')}>{t('accept_proposal')}</Button>
                    <Button size="sm" onClick={() => act(r.id, 'decline_proposal')}>{t('decline_proposal')}</Button>
                  </div>
                </div>
              )}
              {r.response_note && <div style={{ ...muted, marginTop: 6 }}>{t('response_note')}: {r.response_note}</div>}
              {r.status === 'pending' && (
                <div style={{ marginTop: 8 }}><Button size="sm" variant="ghost" onClick={() => act(r.id, 'cancel')}>{t('cancel_request')}</Button></div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// הועבר אליי
// ═════════════════════════════════════════════════════════════════════════════

function SharedTab() {
  const t = useTranslations('meetings_mgr')
  const { lang } = useLang()
  const [list, setList] = useState<Array<{ id: string; content: string; created_at: string; unread: boolean; from_name: string; meeting_title: string; meeting_starts_at: string | null }> | null>(null)
  useEffect(() => {
    fetch('/api/meetings/shared', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { shares: [] })).then(b => setList(b.shares ?? [])).catch(() => setList([]))
  }, [])
  if (list === null) return <Skeleton height={80} />
  if (list.length === 0) return <EmptyState text={t('no_shared')} />
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {list.map(s => (
        <div key={s.id} style={{ ...card, borderColor: s.unread ? 'var(--accent)' : 'var(--border)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.meeting_title}</div>
          <div style={muted}>
            {t('shared_by')} {s.from_name}
            {s.meeting_starts_at ? ` · ${t('meeting_of')} ${formatDate(isoDate(s.meeting_starts_at), lang)}` : ''}
          </div>
          <p style={{ fontSize: 13.5, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{s.content}</p>
        </div>
      ))}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// הגדרות: кто ведёт календарь (מזכירת המנהל)
// ═════════════════════════════════════════════════════════════════════════════

function SettingsTab({ ctx }: { ctx: Context }) {
  const t = useTranslations('meetings_mgr')
  const [rows, setRows] = useState<Array<{ owner_id: string; owner_name: string; delegate_id: string; delegate_name: string; auto: boolean }> | null>(null)
  const [owner, setOwner] = useState<string | null>(ctx.me.id)
  const [delegate, setDelegate] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/meetings/delegates', { cache: 'no-store' })
    setRows(r.ok ? (await r.json()).delegations ?? [] : [])
  }, [])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!delegate) return
    const r = await send('/api/meetings/delegates', 'POST', { delegate_id: delegate, owner_id: owner })
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    toastSuccess(t('delegate_added'))
    setDelegate(null)
    load()
  }

  async function remove(ownerId: string, delegateId: string) {
    const r = await send(`/api/meetings/delegates?owner_id=${ownerId}&delegate_id=${delegateId}`, 'DELETE')
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    load()
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={card}>
        <h3 style={sectionTitle}>{t('delegates_title')}</h3>
        <p style={{ ...muted, margin: '0 0 10px' }}>{t('delegates_hint')}</p>
        {rows === null ? <Skeleton height={40} /> : rows.length === 0 ? <div style={muted}>{t('no_delegates')}</div> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {rows.map(r => (
              <div key={`${r.owner_id}-${r.delegate_id}`} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5 }}>
                <span style={{ flex: 1 }}><b>{r.delegate_name}</b> {t('manages_calendar_of')} <b>{r.owner_id === ctx.me.id ? t('me') : r.owner_name}</b></span>
                {r.auto && <Badge tone="info" label={t('auto_by_position')} />}
                {!r.auto && (r.owner_id === ctx.me.id || r.delegate_id === ctx.me.id || ctx.is_superadmin) && (
                  <Button size="sm" variant="ghost" onClick={() => remove(r.owner_id, r.delegate_id)}>{t('remove')}</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={sectionTitle}>{t('add_delegate')}</h3>
        <div style={{ display: 'grid', gap: 10, maxWidth: 480 }}>
          {ctx.is_superadmin && (
            <div><span style={label}>{t('calendar_owner')}</span>
              <PersonSelect value={owner} allowAdd={false} source={PEOPLE_SOURCE} placeholder={t('calendar_owner')} onChange={id => setOwner(id)} /></div>
          )}
          <div><span style={label}>{t('secretary')}</span>
            <PersonSelect value={delegate} allowAdd={false} source={PEOPLE_SOURCE} placeholder={t('secretary')} onChange={id => setDelegate(id)} /></div>
          <div><Button variant="primary" disabled={!delegate} onClick={add}>{t('add')}</Button></div>
        </div>
      </div>
    </div>
  )
}
