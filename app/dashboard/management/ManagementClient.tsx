'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { PersonSelect } from '@/components/ui/person-select'
import { Skeleton } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { GOAL_STATUSES, type GoalStatus } from '@/lib/management/validation'
import { Badge } from '@/components/ui/Badge'

// ── Типы ответа API ──────────────────────────────────────────────────────────

interface PersonRef { id: string; name: string }

interface Meeting {
  id: string
  title: string
  meeting_date: string
  meeting_time: string | null
  summary: string | null
  decisions: string | null
  created_by_name: string | null
  attendees: PersonRef[]
  goals_count: number
  can_edit: boolean
}

interface Milestone {
  id: string
  goal_id: string
  title: string
  due_date: string | null
  owner_id: string | null
  owner_name: string | null
  done_at: string | null
}

interface Goal {
  id: string
  title: string
  description: string | null
  owner_id: string | null
  owner_name: string | null
  meeting_id: string | null
  meeting_title: string | null
  start_date: string | null
  target_date: string | null
  status: GoalStatus
  progress: number
  can_edit: boolean
  milestones: Milestone[]
}

const STATUS_STYLE: Record<GoalStatus, { bg: string; fg: string }> = {
  active: { bg: 'var(--info-tint)', fg: 'var(--info)' },
  achieved: { bg: 'var(--success-tint)', fg: 'var(--success)' },
  dropped: { bg: 'var(--surface-2)', fg: 'var(--text-faint)' },
}

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14,
}
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8, boxSizing: 'border-box',
  border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)',
}

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const r = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, data }
}

export default function ManagementClient() {
  const t = useTranslations('management')
  const params = useSearchParams()
  const [tab, setTab] = useState<'meetings' | 'goals'>(params.get('goal') ? 'goals' : 'meetings')
  const [meetings, setMeetings] = useState<Meeting[] | null>(null)
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    try {
      const [m, g] = await Promise.all([
        fetch('/api/management/meetings', { cache: 'no-store' }),
        fetch('/api/management/goals', { cache: 'no-store' }),
      ])
      if (!m.ok || !g.ok) { setFailed(true); return }
      setMeetings((await m.json()).meetings ?? [])
      setGoals((await g.json()).goals ?? [])
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent-strong, var(--accent))' : 'var(--border)'}`,
    background: active ? 'var(--accent-strong, var(--accent))' : 'var(--surface)',
    color: active ? 'var(--accent-contrast, #fff)' : 'var(--text)',
  })

  return (
    <div className="p-4 md:p-6" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1000 }}>
      <ModuleHeader module="dashboard" title={t('title')} subtitle={t('subtitle')} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={tabBtn(tab === 'meetings')} onClick={() => setTab('meetings')}>
          {t('tab_meetings')}{meetings ? ` (${meetings.length})` : ''}
        </button>
        <button type="button" style={tabBtn(tab === 'goals')} onClick={() => setTab('goals')}>
          {t('tab_goals')}{goals ? ` (${goals.filter(g => g.status === 'active').length})` : ''}
        </button>
      </div>
      {failed && <p style={{ color: 'var(--danger)', fontSize: 14, margin: 0 }}>{t('load_error')}</p>}
      {!failed && (meetings === null || goals === null) && <Skeleton height={120} />}
      {meetings && goals && tab === 'meetings' && (
        <MeetingsTab meetings={meetings} goals={goals} initialOpen={params.get('meeting')} onChanged={load} />
      )}
      {meetings && goals && tab === 'goals' && (
        <GoalsTab goals={goals} meetings={meetings} initialOpen={params.get('goal')} onChanged={load} />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// אסיפות
// ═════════════════════════════════════════════════════════════════════════════

function MeetingsTab({ meetings, goals, initialOpen, onChanged }: {
  meetings: Meeting[]; goals: Goal[]; initialOpen: string | null; onChanged: () => void
}) {
  const t = useTranslations('management')
  const { lang } = useLang()
  const [open, setOpen] = useState<string | null>(initialOpen)
  const [editing, setEditing] = useState<Meeting | 'new' | null>(null)
  const [goalFor, setGoalFor] = useState<string | null>(null)

  async function remove(m: Meeting) {
    if (!(await confirmDialog({ message: t('meeting_delete_confirm'), tone: 'danger' }))) return
    const r = await send(`/api/management/meetings/${m.id}`, 'DELETE')
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    onChanged()
  }

  return (
    <>
      <div><Button variant="primary" onClick={() => setEditing('new')}>{t('new_meeting')}</Button></div>
      {meetings.length === 0 ? <EmptyState text={t('meetings_empty')} /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {meetings.map(m => {
            const isOpen = open === m.id
            const mGoals = goals.filter(g => g.meeting_id === m.id)
            return (
              <div key={m.id} style={card}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : m.id)}
                  aria-expanded={isOpen}
                  style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'start', color: 'var(--text)' }}
                >
                  <div style={{ minWidth: 86, fontSize: 12.5, fontWeight: 700, color: 'var(--text-muted)' }}>
                    {formatDate(m.meeting_date, lang)}{m.meeting_time ? ` ${m.meeting_time.slice(0, 5)}` : ''}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{m.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.attendees.length > 0 ? m.attendees.map(a => a.name).join(', ') : t('no_attendees')}
                    </div>
                  </div>
                  {m.goals_count > 0 && (
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--info)', whiteSpace: 'nowrap' }}>
                      {t('goals_count').replace('{n}', String(m.goals_count))}
                    </span>
                  )}
                  <span aria-hidden style={{ color: 'var(--text-faint)' }}>{isOpen ? '▴' : '▾'}</span>
                </button>

                {isOpen && (
                  <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                    <TextBlock title={t('summary')} text={m.summary} empty={t('no_summary')} />
                    <TextBlock title={t('decisions')} text={m.decisions} empty={t('no_decisions')} />
                    <div>
                      <div style={{ ...label, marginBottom: 6 }}>{t('meeting_goals')}</div>
                      {mGoals.length === 0 ? (
                        <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('no_meeting_goals')}</div>
                      ) : (
                        <div style={{ display: 'grid', gap: 6 }}>
                          {mGoals.map(g => (
                            <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                              <StatusBadge status={g.status} />
                              <span style={{ flex: 1 }}>{g.title}</span>
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                {g.owner_name ?? ''}{g.target_date ? ` · ${formatDate(g.target_date, lang)}` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button size="sm" onClick={() => setGoalFor(m.id)}>{t('add_goal_from_meeting')}</Button>
                      {m.can_edit && <Button size="sm" onClick={() => setEditing(m)}>{t('edit')}</Button>}
                      {m.can_edit && <Button size="sm" variant="danger" onClick={() => remove(m)}>{t('delete')}</Button>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {editing && (
        <MeetingModal
          meeting={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); onChanged() }}
        />
      )}
      {goalFor && (
        <GoalModal
          goal={null}
          meetings={meetings}
          defaultMeetingId={goalFor}
          onClose={() => setGoalFor(null)}
          onDone={() => { setGoalFor(null); onChanged() }}
        />
      )}
    </>
  )
}

function TextBlock({ title, text, empty }: { title: string; text: string | null; empty: string }) {
  return (
    <div>
      <div style={{ ...label, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: text ? 'var(--text)' : 'var(--text-faint)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
        {text ?? empty}
      </div>
    </div>
  )
}

function MeetingModal({ meeting, onClose, onDone }: { meeting: Meeting | null; onClose: () => void; onDone: () => void }) {
  const t = useTranslations('management')
  const [title, setTitle] = useState(meeting?.title ?? '')
  const [date, setDate] = useState(meeting?.meeting_date ?? new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState(meeting?.meeting_time?.slice(0, 5) ?? '')
  const [summary, setSummary] = useState(meeting?.summary ?? '')
  const [decisions, setDecisions] = useState(meeting?.decisions ?? '')
  const [attendees, setAttendees] = useState<PersonRef[]>(meeting?.attendees ?? [])
  const [picker, setPicker] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) { toastError(t('title_required')); return }
    setSaving(true)
    try {
      const body = {
        title, meeting_date: date, meeting_time: time || null, summary, decisions,
        attendee_ids: attendees.map(a => a.id),
      }
      const r = meeting
        ? await send(`/api/management/meetings/${meeting.id}`, 'PATCH', body)
        : await send('/api/management/meetings', 'POST', body)
      if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
      toastSuccess(t('saved'))
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={560} panelStyle={{ padding: 22 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px', color: 'var(--text)' }}>
        {meeting ? t('edit_meeting') : t('new_meeting')}
      </h2>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={label}>{t('meeting_title')} *</label>
          <input aria-label={t('meeting_title')} value={title} onChange={e => setTitle(e.target.value)} style={input} />
        </div>
        <div className="resp-grid-2" style={{ gap: 12 }}>
          <div>
            <label style={label}>{t('date')} *</label>
            <input aria-label={t('date')} type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
          </div>
          <div>
            <label style={label}>{t('time')}</label>
            <input aria-label={t('time')} type="time" value={time} onChange={e => setTime(e.target.value)} style={input} />
          </div>
        </div>
        <div>
          <label style={label}>{t('attendees')}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            {attendees.map(a => (
              <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 12, background: 'var(--surface-2)', fontSize: 12, color: 'var(--text)' }}>
                {a.name}
                <button type="button" aria-label={t('remove')} onClick={() => setAttendees(prev => prev.filter(x => x.id !== a.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <PersonSelect
            value={picker}
            allowAdd={false}
            placeholder={t('add_attendee')}
            onChange={(id, p) => {
              if (id && !attendees.some(a => a.id === id)) {
                setAttendees(prev => [...prev, { id, name: p?.hebrew_name || p?.full_name || '—' }])
              }
              setPicker(null)
            }}
          />
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>{t('attendees_hint')}</div>
        </div>
        <div>
          <label style={label}>{t('summary')}</label>
          <textarea aria-label={t('summary')} value={summary} onChange={e => setSummary(e.target.value)} rows={5} style={{ ...input, resize: 'vertical' }} />
        </div>
        <div>
          <label style={label}>{t('decisions')}</label>
          <textarea aria-label={t('decisions')} value={decisions} onChange={e => setDecisions(e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Button onClick={onClose} disabled={saving}>{t('cancel')}</Button>
        <Button variant="primary" onClick={save} disabled={saving}>{saving ? t('saving') : t('save')}</Button>
      </div>
    </Modal>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// מטרות
// ═════════════════════════════════════════════════════════════════════════════

function StatusBadge({ status }: { status: GoalStatus }) {
  const t = useTranslations('management')
  return <Badge dot label={t(`goal_status.${status}`)} colors={STATUS_STYLE[status]} />
}

function GoalsTab({ goals, meetings, initialOpen, onChanged }: {
  goals: Goal[]; meetings: Meeting[]; initialOpen: string | null; onChanged: () => void
}) {
  const t = useTranslations('management')
  const { lang } = useLang()
  const [filter, setFilter] = useState<GoalStatus | 'all'>('active')
  const [open, setOpen] = useState<string | null>(initialOpen)
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const shown = useMemo(() => goals.filter(g => filter === 'all' || g.status === filter), [goals, filter])

  async function remove(g: Goal) {
    if (!(await confirmDialog({ message: t('goal_delete_confirm'), tone: 'danger' }))) return
    const r = await send(`/api/management/goals/${g.id}`, 'DELETE')
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    onChanged()
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="primary" onClick={() => setEditing('new')}>{t('new_goal')}</Button>
        <select aria-label={t('filter')} value={filter} onChange={e => setFilter(e.target.value as GoalStatus | 'all')} style={{ ...input, width: 'auto' }}>
          {GOAL_STATUSES.map(s => <option key={s} value={s}>{t(`goal_status.${s}`)}</option>)}
          <option value="all">{t('all')}</option>
        </select>
      </div>
      {shown.length === 0 ? <EmptyState text={t('goals_empty')} /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {shown.map(g => {
            const isOpen = open === g.id
            const overdue = g.status === 'active' && !!g.target_date && g.target_date < today
            const doneMs = g.milestones.filter(m => m.done_at).length
            return (
              <div key={g.id} style={card}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : g.id)}
                  aria-expanded={isOpen}
                  style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'start', color: 'var(--text)' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{g.title}</span>
                      <StatusBadge status={g.status} />
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>
                      {g.owner_name ?? '—'}
                      {g.target_date && (
                        <span style={{ color: overdue ? 'var(--danger)' : undefined, fontWeight: overdue ? 700 : undefined }}>
                          {' · '}{t('target')} {formatDate(g.target_date, lang)}
                        </span>
                      )}
                      {g.milestones.length > 0 && ` · ${t('milestones_done').replace('{done}', String(doneMs)).replace('{total}', String(g.milestones.length))}`}
                    </div>
                  </div>
                  <div style={{ width: 90 }} aria-label={`${g.progress}%`}>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
                      <div style={{ width: `${g.progress}%`, height: '100%', background: 'var(--accent-strong, var(--accent))' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 2 }}>{g.progress}%</div>
                  </div>
                  <span aria-hidden style={{ color: 'var(--text-faint)' }}>{isOpen ? '▴' : '▾'}</span>
                </button>

                {isOpen && (
                  <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                    {g.description && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{g.description}</div>}
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      {g.start_date && <span>{t('start')} {formatDate(g.start_date, lang)}</span>}
                      {g.meeting_title && <span>{t('from_meeting')} {g.meeting_title}</span>}
                    </div>
                    <Milestones goal={g} onChanged={onChanged} />
                    {g.can_edit && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button size="sm" onClick={() => setEditing(g)}>{t('edit')}</Button>
                        <Button size="sm" variant="danger" onClick={() => remove(g)}>{t('delete')}</Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {editing && (
        <GoalModal
          goal={editing === 'new' ? null : editing}
          meetings={meetings}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); onChanged() }}
        />
      )}
    </>
  )
}

function Milestones({ goal, onChanged }: { goal: Goal; onChanged: () => void }) {
  const t = useTranslations('management')
  const { lang } = useLang()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [owner, setOwner] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!title.trim()) { toastError(t('title_required')); return }
    setBusy(true)
    try {
      const r = await send(`/api/management/goals/${goal.id}/milestones`, 'POST', { title, due_date: due || null, owner_id: owner })
      if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
      setTitle(''); setDue(''); setOwner(null)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function toggle(m: Milestone) {
    const r = await send(`/api/management/milestones/${m.id}`, 'PATCH', { done: !m.done_at })
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    onChanged()
  }

  async function remove(m: Milestone) {
    const r = await send(`/api/management/milestones/${m.id}`, 'DELETE')
    if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
    onChanged()
  }

  return (
    <div>
      <div style={{ ...label, marginBottom: 6 }}>{t('milestones')}</div>
      {goal.milestones.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 6 }}>{t('no_milestones')}</div>}
      <div style={{ display: 'grid', gap: 6 }}>
        {goal.milestones.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={!!m.done_at} onChange={() => toggle(m)} aria-label={t('mark_done')} />
            <span style={{ flex: 1, textDecoration: m.done_at ? 'line-through' : 'none', color: m.done_at ? 'var(--text-faint)' : 'var(--text)' }}>{m.title}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {m.owner_name ?? ''}{m.due_date ? ` · ${formatDate(m.due_date, lang)}` : ''}
            </span>
            {goal.can_edit && (
              <button type="button" aria-label={t('delete')} onClick={() => remove(m)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 15, padding: 0 }}>×</button>
            )}
          </div>
        ))}
      </div>
      {goal.can_edit && (
        <div style={{ display: 'grid', gap: 6, marginTop: 10, padding: 10, borderRadius: 8, background: 'var(--surface-2)' }}>
          <input aria-label={t('milestone_title')} placeholder={t('milestone_title')} value={title} onChange={e => setTitle(e.target.value)} style={input} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <input aria-label={t('due')} type="date" value={due} onChange={e => setDue(e.target.value)} style={{ ...input, width: 160 }} />
            <div style={{ flex: '1 1 200px' }}>
              <PersonSelect value={owner} allowAdd={false} placeholder={t('milestone_owner')} onChange={id => setOwner(id)} />
            </div>
            <Button size="sm" variant="primary" onClick={add} disabled={busy}>{t('add_milestone')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function GoalModal({ goal, meetings, defaultMeetingId, onClose, onDone }: {
  goal: Goal | null; meetings: Meeting[]; defaultMeetingId?: string; onClose: () => void; onDone: () => void
}) {
  const t = useTranslations('management')
  const { lang } = useLang()
  const [title, setTitle] = useState(goal?.title ?? '')
  const [description, setDescription] = useState(goal?.description ?? '')
  const [owner, setOwner] = useState<string | null>(goal?.owner_id ?? null)
  const [meetingId, setMeetingId] = useState(goal?.meeting_id ?? defaultMeetingId ?? '')
  const [start, setStart] = useState(goal?.start_date ?? '')
  const [target, setTarget] = useState(goal?.target_date ?? '')
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? 'active')
  const [progress, setProgress] = useState(goal?.progress ?? 0)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!title.trim()) { toastError(t('title_required')); return }
    if (start && target && target < start) { toastError(t('dates_order')); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        title, description, meeting_id: meetingId || null, start_date: start || null, target_date: target || null,
        status, progress,
      }
      if (owner) body.owner_id = owner
      const r = goal
        ? await send(`/api/management/goals/${goal.id}`, 'PATCH', body)
        : await send('/api/management/goals', 'POST', body)
      if (!r.ok) { toastError(String(r.data.error ?? t('action_failed'))); return }
      toastSuccess(t('saved'))
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={540} panelStyle={{ padding: 22 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px', color: 'var(--text)' }}>
        {goal ? t('edit_goal') : t('new_goal')}
      </h2>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={label}>{t('goal_title')} *</label>
          <input aria-label={t('goal_title')} value={title} onChange={e => setTitle(e.target.value)} style={input} />
        </div>
        <div>
          <label style={label}>{t('description')}</label>
          <textarea aria-label={t('description')} value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} />
        </div>
        <div>
          <label style={label}>{t('owner')}</label>
          <PersonSelect value={owner} allowAdd={false} placeholder={t('owner_placeholder')} onChange={id => setOwner(id)} />
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>{t('owner_hint')}</div>
        </div>
        <div className="resp-grid-2" style={{ gap: 12 }}>
          <div>
            <label style={label}>{t('start_date')}</label>
            <input aria-label={t('start_date')} type="date" value={start} onChange={e => setStart(e.target.value)} style={input} />
          </div>
          <div>
            <label style={label}>{t('target_date')}</label>
            <input aria-label={t('target_date')} type="date" value={target} onChange={e => setTarget(e.target.value)} style={input} />
          </div>
        </div>
        <div className="resp-grid-2" style={{ gap: 12 }}>
          <div>
            <label style={label}>{t('status')}</label>
            <select aria-label={t('status')} value={status} onChange={e => setStatus(e.target.value as GoalStatus)} style={input}>
              {GOAL_STATUSES.map(s => <option key={s} value={s}>{t(`goal_status.${s}`)}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>{t('progress')}: {progress}%</label>
            <input aria-label={t('progress')} type="range" min={0} max={100} step={5} value={progress} onChange={e => setProgress(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
        </div>
        <div>
          <label style={label}>{t('meeting')}</label>
          <select aria-label={t('meeting')} value={meetingId} onChange={e => setMeetingId(e.target.value)} style={input}>
            <option value="">{t('no_meeting')}</option>
            {meetings.map(m => <option key={m.id} value={m.id}>{formatDate(m.meeting_date, lang)} · {m.title}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Button onClick={onClose} disabled={saving}>{t('cancel')}</Button>
        <Button variant="primary" onClick={save} disabled={saving}>{saving ? t('saving') : t('save')}</Button>
      </div>
    </Modal>
  )
}
