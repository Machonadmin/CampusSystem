'use client'

import { useEffect, useState } from 'react'
import { PersonSelect } from '@/components/ui/person-select'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import type { RecurrenceRule, RecurrenceFrequency } from '@/lib/tasks/recurrence'

// ── Types ─────────────────────────────────────────────────────────────────────

type AssigneeMode = 'me' | 'person' | 'department'
type TaskKind     = 'once' | 'recurring'
type DueTimeType  = 'allday' | 'exact'
type SeriesEnd    = 'never' | 'until_date' | 'after_count'

interface Department { id: string; name: string }
interface Watcher   { id: string; full_name: string }

// ── Locale-aware calendar helpers (Intl instead of hand-rolled name tables) ──

function localeFor(lang: string): string {
  return lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-US' : 'ru-RU'
}

// 2024-01-01 is a Monday — used as a stable anchor week to derive localized weekday names.
function weekdayLabel(lang: string, wd: number, format: 'short' | 'long'): string {
  const d = new Date(Date.UTC(2024, 0, wd))
  return d.toLocaleDateString(localeFor(lang), { weekday: format, timeZone: 'UTC' })
}

function monthLabel(lang: string, month1to12: number): string {
  const d = new Date(Date.UTC(2024, month1to12 - 1, 1))
  return d.toLocaleDateString(localeFor(lang), { month: 'long', timeZone: 'UTC' })
}

function formatFullDate(lang: string, iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString(localeFor(lang), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const PRIORITY_VALUES = ['urgent', 'high', 'normal', 'low'] as const
const PRIORITY_COLORS: Record<typeof PRIORITY_VALUES[number], string> = {
  urgent: '#DC2626', high: '#D97706', normal: 'var(--accent-strong)', low: 'var(--text-muted)',
}

const today = () => new Date().toISOString().slice(0, 10)

// ── Props ─────────────────────────────────────────────────────────────────────

interface TaskCreateModalProps {
  currentUserId: string
  onClose:  () => void
  onSaved:  () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TaskCreateModal({ currentUserId, onClose, onSaved }: TaskCreateModalProps) {
  const t = useTranslations('tasks')
  const tCommon = useTranslations('common')
  const { lang } = useLang()

  const FREQ_OPTIONS: { value: RecurrenceFrequency; label: string; sub: string }[] = [
    { value: 'daily',   label: t('create_modal.freq_daily_label'),   sub: t('create_modal.freq_daily_sub') },
    { value: 'weekly',  label: t('create_modal.freq_weekly_label'),  sub: t('create_modal.freq_weekly_sub') },
    { value: 'monthly', label: t('create_modal.freq_monthly_label'), sub: t('create_modal.freq_monthly_sub') },
    { value: 'yearly',  label: t('create_modal.freq_yearly_label'),  sub: t('create_modal.freq_yearly_sub') },
  ]

  // ── core fields ──
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [priority,    setPriority]    = useState<'urgent'|'high'|'normal'|'low'>('normal')
  const [kind,        setKind]        = useState<TaskKind>('once')

  // ── assignee ──
  const [assigneeMode,         setAssigneeMode]         = useState<AssigneeMode>('me')
  const [assigneePersonId,     setAssigneePersonId]     = useState<string | null>(null)
  const [assigneeDepartmentId, setAssigneeDepartmentId] = useState<string>('')
  const [departments,          setDepartments]          = useState<Department[]>([])

  // ── one-time due ──
  const [dueDate,     setDueDate]     = useState(today())
  const [dueTimeType, setDueTimeType] = useState<DueTimeType>('allday')
  const [dueTime,     setDueTime]     = useState('09:00')
  const [addToCalendar, setAddToCalendar] = useState(false)

  // ── recurring ──
  const [frequency,            setFrequency]            = useState<RecurrenceFrequency>('weekly')
  const [recurrenceStartDate,  setRecurrenceStartDate]  = useState(today())
  const [weekdays,             setWeekdays]             = useState<number[]>([])
  const [monthDay,             setMonthDay]             = useState('')
  const [yearMonth,            setYearMonth]            = useState('1')
  const [yearDay,              setYearDay]              = useState('')
  const [enableTime,           setEnableTime]           = useState(false)
  const [recurrenceTime,       setRecurrenceTime]       = useState('09:00')
  const [seriesEnd,            setSeriesEnd]            = useState<SeriesEnd>('never')
  const [seriesUntilDate,      setSeriesUntilDate]      = useState('')
  const [seriesCount,          setSeriesCount]          = useState('10')

  // ── watchers ──
  const [watchers,         setWatchers]         = useState<Watcher[]>([])
  const [watcherPersonId,  setWatcherPersonId]  = useState<string | null>(null)

  // ── ui ──
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // ── load departments ──
  useEffect(() => {
    fetch('/api/settings/departments')
      .then(r => r.ok ? r.json() : [])
      .then(d => setDepartments(Array.isArray(d) ? d : (d.departments ?? [])))
      .catch(() => {})
  }, [])

  // ── toggle weekday ──
  function toggleWeekday(wd: number) {
    setWeekdays(prev =>
      prev.includes(wd) ? prev.filter(x => x !== wd) : [...prev, wd]
    )
  }

  // ── add watcher ──
  function addWatcher(id: string | null, data?: { id: string; full_name: string }) {
    if (!id || !data) return
    if (id === currentUserId) return
    if (watchers.some(w => w.id === id)) return
    setWatchers(prev => [...prev, { id: data.id, full_name: data.full_name }])
    setWatcherPersonId(null)
  }

  // ── submit ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) { setError(t('create_modal.error_title_required')); return }
    if (assigneeMode === 'person' && !assigneePersonId) { setError(t('create_modal.error_assignee_required')); return }
    if (assigneeMode === 'department' && !assigneeDepartmentId) { setError(t('create_modal.error_department_required')); return }

    if (kind === 'recurring' && frequency === 'weekly' && weekdays.length === 0) {
      setError(t('create_modal.error_weekday_required')); return
    }
    if (kind === 'recurring' && frequency === 'monthly' && !monthDay) {
      setError(t('create_modal.error_month_day_required')); return
    }
    if (kind === 'recurring' && frequency === 'yearly' && (!yearMonth || !yearDay)) {
      setError(t('create_modal.error_yearly_required')); return
    }

    setSaving(true)
    try {
      const commonBody = {
        title: title.trim(),
        description: description.trim() || undefined,
        assignee_mode: assigneeMode,
        assignee_id:   assigneeMode === 'person'     ? assigneePersonId  : undefined,
        department_id: assigneeMode === 'department' ? assigneeDepartmentId : undefined,
        priority,
        module: 'general',
        watchers: watchers.map(w => w.id),
      }

      let resp: Response

      if (kind === 'once') {
        const allday = dueTimeType === 'allday'
        resp = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...commonBody,
            due_date:     dueDate || null,
            due_time:     !allday && dueTime ? dueTime : null,
            due_all_day:  allday,
          }),
        })
      } else {
        const rule: RecurrenceRule = {
          frequency,
          end_type:       seriesEnd,
          end_date:       seriesEnd === 'until_date' ? seriesUntilDate : undefined,
          end_after_count: seriesEnd === 'after_count' ? parseInt(seriesCount, 10) : undefined,
          time:           enableTime ? recurrenceTime : null,
          weekdays:       frequency === 'weekly'  ? weekdays                 : undefined,
          monthly_day:    frequency === 'monthly' ? parseInt(monthDay, 10)   : undefined,
          yearly_month:   frequency === 'yearly'  ? parseInt(yearMonth, 10)  : undefined,
          yearly_day:     frequency === 'yearly'  ? parseInt(yearDay, 10)    : undefined,
        }
        resp = await fetch('/api/tasks/series', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...commonBody,
            start_date:       recurrenceStartDate,
            due_all_day:      !enableTime,
            due_time:         enableTime ? recurrenceTime : null,
            recurrence_rule:  rule,
          }),
        })
      }

      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        throw new Error(j.error ?? `${t('create_modal.error_unknown')} ${resp.status}`)
      }

      // Опционально — сразу положить одноразовую задачу в личный календарь.
      if (kind === 'once' && addToCalendar && dueDate) {
        const created = await resp.json().catch(() => null) as { id?: string } | null
        const allday = dueTimeType === 'allday'
        await fetch('/api/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            event_date: dueDate,
            event_time: !allday && dueTime ? dueTime : null,
            source_type: 'task',
            source_id: created?.id ?? null,
            link: created?.id ? `/dashboard/tasks/${created.id}` : null,
          }),
        }).catch(() => { /* календарь не критичен для создания задачи */ })
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('create_modal.error_unknown'))
    } finally {
      setSaving(false)
    }
  }

  // ── preview ──
  function computePreview(): string {
    const timeStr = (time: string) => time ? ` ${t('create_modal.preview_at_time').replace('{time}', time)}` : ''

    if (kind === 'once') {
      if (!dueDate) return t('create_modal.preview_no_date')
      const timePart = dueTimeType === 'exact' && dueTime ? timeStr(dueTime) : ''
      return `${formatFullDate(lang, dueDate)}${timePart}`
    }

    if (!recurrenceStartDate) return t('create_modal.preview_no_date')
    const timePart = enableTime && recurrenceTime ? timeStr(recurrenceTime) : ''

    if (frequency === 'daily') {
      return `${formatFullDate(lang, recurrenceStartDate)}${timePart}`
    }
    if (frequency === 'weekly') {
      const names = [...weekdays].sort((a, b) => a - b).map(w => weekdayLabel(lang, w, 'long')).join(', ')
      if (!names) return t('create_modal.preview_no_date')
      return t('create_modal.preview_weekly')
        .replace('{days}', names)
        .replace('{time}', timePart)
        .replace('{date}', formatFullDate(lang, recurrenceStartDate))
    }
    if (frequency === 'monthly') {
      const d = parseInt(monthDay, 10)
      if (!d) return t('create_modal.preview_no_date')
      return t('create_modal.preview_monthly').replace('{day}', String(d)).replace('{time}', timePart)
    }
    if (frequency === 'yearly') {
      const m = parseInt(yearMonth, 10)
      const d = parseInt(yearDay, 10)
      if (!m || !d) return t('create_modal.preview_no_date')
      return t('create_modal.preview_yearly')
        .replace('{day}', String(d))
        .replace('{month}', monthLabel(lang, m))
        .replace('{time}', timePart)
    }
    return t('create_modal.preview_no_date')
  }
  const preview = computePreview()

  // ── styles ──
  const inp: React.CSSProperties = {
    padding: '7px 10px', fontSize: 13,
    border: '1px solid var(--border-strong)', borderRadius: 8,
    outline: 'none', background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box',
  }
  const segBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '7px 0', fontSize: 13, fontWeight: active ? 600 : 400,
    border: '1px solid ' + (active ? '#F59E0B' : 'var(--border-strong)'),
    borderRadius: 8, cursor: 'pointer',
    background: active ? '#FEF3C7' : 'var(--surface)',
    color: active ? '#92400E' : 'var(--text)',
  })
  const assigneeBtn = (mode: AssigneeMode): React.CSSProperties => ({
    flex: 1, padding: '7px 0', fontSize: 13, fontWeight: assigneeMode === mode ? 600 : 400,
    border: '1px solid ' + (assigneeMode === mode ? '#F59E0B' : 'var(--border-strong)'),
    borderRadius: 8, cursor: 'pointer',
    background: assigneeMode === mode ? '#FEF3C7' : 'var(--surface)',
    color: assigneeMode === mode ? '#92400E' : 'var(--text)',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 560,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {t('create_modal.title')}
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ overflow: 'auto', flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Title */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('create_modal.name_label')} *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('create_modal.name_placeholder')}
              style={inp}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('create_modal.description_label')}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('create_modal.description_placeholder')}
              rows={2}
              style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Kind toggle */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('create_modal.type_label')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setKind('once')}      style={segBtn(kind === 'once')}>{t('create_modal.type_once')}</button>
              <button type="button" onClick={() => setKind('recurring')} style={segBtn(kind === 'recurring')}>{t('create_modal.type_recurring')}</button>
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('create_modal.assignee_label')}</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button type="button" onClick={() => setAssigneeMode('me')}         style={assigneeBtn('me')}>{t('create_modal.assignee_me')}</button>
              <button type="button" onClick={() => setAssigneeMode('person')}     style={assigneeBtn('person')}>{t('create_modal.assignee_person')}</button>
              <button type="button" onClick={() => setAssigneeMode('department')} style={assigneeBtn('department')}>{t('create_modal.assignee_department')}</button>
            </div>
            {assigneeMode === 'person' && (
              <PersonSelect
                value={assigneePersonId}
                onChange={id => setAssigneePersonId(id)}
                placeholder={t('create_modal.assignee_select_placeholder')}
                accentColor="#F59E0B"
              />
            )}
            {assigneeMode === 'department' && (
              <select value={assigneeDepartmentId} onChange={e => setAssigneeDepartmentId(e.target.value)} style={inp}>
                <option value="">{t('create_modal.department_select_placeholder')}</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
          </div>

          {/* ── ONE-TIME DUE ── */}
          {kind === 'once' && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('create_modal.due_label')}</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button type="button" onClick={() => setDueTimeType('allday')} style={segBtn(dueTimeType === 'allday')}>{t('create_modal.due_allday')}</button>
                <button type="button" onClick={() => setDueTimeType('exact')}  style={segBtn(dueTimeType === 'exact')}>{t('create_modal.due_exact')}</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...inp, flex: 1 }} />
                {dueTimeType === 'exact' && (
                  <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} style={{ ...inp, width: 110 }} />
                )}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={addToCalendar} onChange={e => setAddToCalendar(e.target.checked)} style={{ accentColor: 'var(--accent-strong)' }} />
                <span style={{ fontSize: 13, color: 'var(--text)' }}>📅 {t('create_modal.add_to_calendar')}</span>
              </label>
            </div>
          )}

          {/* ── RECURRING ── */}
          {kind === 'recurring' && (
            <>
              {/* Start date */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('create_modal.start_from_label')}</label>
                <input type="date" value={recurrenceStartDate} onChange={e => setRecurrenceStartDate(e.target.value)} style={{ ...inp, maxWidth: 200 }} />
              </div>

              {/* Frequency cards */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('create_modal.frequency_label')}</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {FREQ_OPTIONS.map(opt => {
                    const active = frequency === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFrequency(opt.value)}
                        style={{
                          padding: '10px 12px', textAlign: 'start',
                          border: '2px solid ' + (active ? '#F59E0B' : 'var(--border)'),
                          borderRadius: 10, cursor: 'pointer',
                          background: active ? '#FFFBEB' : 'var(--surface)',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: active ? '#92400E' : 'var(--text)' }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{opt.sub}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Weekly weekdays */}
              {frequency === 'weekly' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('create_modal.weekdays_label')}</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {Array.from({ length: 7 }, (_, i) => i + 1).map(wd => {
                      const on = weekdays.includes(wd)
                      return (
                        <button
                          key={wd}
                          type="button"
                          onClick={() => toggleWeekday(wd)}
                          style={{
                            width: 36, height: 36, borderRadius: '50%', fontSize: 12, fontWeight: on ? 600 : 400,
                            border: '1px solid ' + (on ? '#F59E0B' : 'var(--border-strong)'),
                            background: on ? '#F59E0B' : 'var(--surface)',
                            color: on ? 'var(--surface)' : 'var(--text)',
                            cursor: 'pointer',
                          }}
                        >
                          {weekdayLabel(lang, wd, 'short')}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Monthly day */}
              {frequency === 'monthly' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('create_modal.month_day_label')}</label>
                  <input
                    type="number" min={1} max={31} value={monthDay}
                    onChange={e => setMonthDay(e.target.value)}
                    placeholder={t('create_modal.month_day_placeholder')}
                    style={{ ...inp, maxWidth: 100 }}
                  />
                </div>
              )}

              {/* Yearly month + day */}
              {frequency === 'yearly' && (
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 2 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('create_modal.month_label')}</label>
                    <select value={yearMonth} onChange={e => setYearMonth(e.target.value)} style={inp}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{monthLabel(lang, m)}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('create_modal.day_label')}</label>
                    <input
                      type="number" min={1} max={31} value={yearDay}
                      onChange={e => setYearDay(e.target.value)}
                      placeholder={t('create_modal.day_placeholder')}
                      style={inp}
                    />
                  </div>
                </div>
              )}

              {/* Optional time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                  <input type="checkbox" checked={enableTime} onChange={e => setEnableTime(e.target.checked)} />
                  {t('create_modal.specific_time_label')}
                </label>
                {enableTime && (
                  <input type="time" value={recurrenceTime} onChange={e => setRecurrenceTime(e.target.value)}
                    style={{ ...inp, width: 110 }} />
                )}
              </div>

              {/* Series end */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('create_modal.series_end_label')}</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {([
                    ['never',       t('create_modal.series_end_never')],
                    ['until_date',  t('create_modal.series_end_until')],
                    ['after_count', t('create_modal.series_end_after_count')],
                  ] as const).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSeriesEnd(val)}
                      style={segBtn(seriesEnd === val)}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                {seriesEnd === 'until_date' && (
                  <input type="date" value={seriesUntilDate} onChange={e => setSeriesUntilDate(e.target.value)} style={{ ...inp, maxWidth: 200 }} />
                )}
                {seriesEnd === 'after_count' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number" min={1} max={500} value={seriesCount}
                      onChange={e => setSeriesCount(e.target.value)}
                      style={{ ...inp, maxWidth: 100 }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('create_modal.occurrences_suffix')}</span>
                  </div>
                )}
              </div>

              {/* Preview */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--text)' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 12 }}>{t('create_modal.next_occurrence_label')} </span>
                {preview}
              </div>
            </>
          )}

          {/* Priority */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('create_modal.priority_label')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIORITY_VALUES.map(p => {
                const active = priority === p
                const color = PRIORITY_COLORS[p]
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    style={{
                      flex: 1, padding: '6px 0', fontSize: 12, fontWeight: active ? 700 : 400,
                      border: '1px solid ' + (active ? color : 'var(--border-strong)'),
                      borderRadius: 8, cursor: 'pointer',
                      background: active ? color + '18' : 'var(--surface)',
                      color: active ? color : 'var(--text-muted)',
                    }}
                  >
                    {t(`priority.${p}`, p)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Watchers */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('create_modal.watchers_label')}</label>
            {watchers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {watchers.map(w => (
                  <span key={w.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 8px', background: 'var(--accent-tint)', borderRadius: 99,
                    fontSize: 12, color: '#1E40AF',
                  }}>
                    {w.full_name}
                    <button
                      type="button"
                      onClick={() => setWatchers(prev => prev.filter(x => x.id !== w.id))}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#60A5FA', fontSize: 14, lineHeight: 1, padding: 0 }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}
            <PersonSelect
              value={watcherPersonId}
              onChange={(id, data) => addWatcher(id, data as { id: string; full_name: string })}
              placeholder={t('create_modal.watcher_placeholder')}
              accentColor="#F59E0B"
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '10px 14px', background: '#FEE2E2', color: '#991B1B', borderRadius: 8, fontSize: 13 }}>
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0,
        }}>
          <button type="button" onClick={onClose}
            style={{ padding: '8px 16px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)' }}>
            {tCommon('cancel')}
          </button>
          <button
            type="submit"
            form=""
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 600,
              border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer',
              background: '#F59E0B', color: '#fff', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? t('create_modal.creating_button') : (kind === 'once' ? t('create_modal.create_button') : t('create_modal.create_series_button'))}
          </button>
        </div>
      </div>
    </div>
  )
}
