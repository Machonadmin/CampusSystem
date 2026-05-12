'use client'

import { useEffect, useState } from 'react'
import { PersonSelect } from '@/components/ui/person-select'
import type { RecurrenceRule, RecurrenceFrequency } from '@/lib/tasks/recurrence'

// ── Types ─────────────────────────────────────────────────────────────────────

type AssigneeMode = 'me' | 'person' | 'department'
type TaskKind     = 'once' | 'recurring'
type DueTimeType  = 'allday' | 'exact'
type SeriesEnd    = 'never' | 'until_date' | 'after_count'

interface Department { id: string; name: string }
interface Watcher   { id: string; full_name: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTH_LABELS   = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
const PRIORITIES = [
  { value: 'urgent', label: 'Срочно',   color: '#DC2626' },
  { value: 'high',   label: 'Высокий',  color: '#D97706' },
  { value: 'normal', label: 'Обычный',  color: '#2563EB' },
  { value: 'low',    label: 'Низкий',   color: '#6B7280' },
] as const

const FREQ_OPTIONS: { value: RecurrenceFrequency; label: string; sub: string }[] = [
  { value: 'daily',   label: 'Каждый день',   sub: 'Ежедневные задачи' },
  { value: 'weekly',  label: 'Каждую неделю', sub: 'В выбранные дни' },
  { value: 'monthly', label: 'Каждый месяц',  sub: 'В конкретное число' },
  { value: 'yearly',  label: 'Каждый год',    sub: 'В конкретную дату' },
]

const today = () => new Date().toISOString().slice(0, 10)

// ── Helper: human-readable preview ───────────────────────────────────────────

function computeNextOccurrence(
  kind: TaskKind,
  dueDate: string,
  dueTimeType: DueTimeType,
  dueTime: string,
  frequency: RecurrenceFrequency,
  recurrenceStartDate: string,
  weekdays: number[],
  monthDay: string,
  yearMonth: string,
  yearDay: string,
  enableTime: boolean,
  recurrenceTime: string,
): string {
  const RU_DAYS  = ['', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']
  const RU_MONTHS = [
    '', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ]
  const timeStr = (t: string) => t ? ` в ${t}` : ''

  if (kind === 'once') {
    if (!dueDate) return '—'
    const d = new Date(dueDate + 'T00:00:00Z')
    const day   = d.getUTCDate()
    const month = RU_MONTHS[d.getUTCMonth() + 1]
    const year  = d.getUTCFullYear()
    const t = dueTimeType === 'exact' && dueTime ? ` в ${dueTime}` : ''
    return `${day} ${month} ${year}${t}`
  }

  // Recurring
  if (!recurrenceStartDate) return '—'
  const sd  = new Date(recurrenceStartDate + 'T00:00:00Z')
  const day = sd.getUTCDate()
  const mon = RU_MONTHS[sd.getUTCMonth() + 1]
  const yr  = sd.getUTCFullYear()
  const t   = enableTime && recurrenceTime ? timeStr(recurrenceTime) : ''

  if (frequency === 'daily') {
    return `${day} ${mon} ${yr}${t}`
  }
  if (frequency === 'weekly') {
    const wdNames = weekdays.sort((a, b) => a - b).map(w => RU_DAYS[w]).join(', ')
    return wdNames ? `${wdNames}${t}, начиная с ${day} ${mon} ${yr}` : '—'
  }
  if (frequency === 'monthly') {
    const d = parseInt(monthDay, 10)
    return d ? `${d}-го числа каждого месяца${t}` : '—'
  }
  if (frequency === 'yearly') {
    const m = parseInt(yearMonth, 10)
    const d = parseInt(yearDay, 10)
    return m && d ? `${d} ${RU_MONTHS[m]} каждого года${t}` : '—'
  }
  return '—'
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface TaskCreateModalProps {
  currentUserId: string
  onClose:  () => void
  onSaved:  () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TaskCreateModal({ currentUserId, onClose, onSaved }: TaskCreateModalProps) {

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

    if (!title.trim()) { setError('Введите название задачи'); return }
    if (assigneeMode === 'person' && !assigneePersonId) { setError('Выберите исполнителя'); return }
    if (assigneeMode === 'department' && !assigneeDepartmentId) { setError('Выберите отдел'); return }

    if (kind === 'recurring' && frequency === 'weekly' && weekdays.length === 0) {
      setError('Выберите хотя бы один день недели'); return
    }
    if (kind === 'recurring' && frequency === 'monthly' && !monthDay) {
      setError('Укажите день месяца'); return
    }
    if (kind === 'recurring' && frequency === 'yearly' && (!yearMonth || !yearDay)) {
      setError('Укажите месяц и день для ежегодной задачи'); return
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
        throw new Error(j.error ?? `Ошибка ${resp.status}`)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setSaving(false)
    }
  }

  // ── preview ──
  const preview = computeNextOccurrence(
    kind, dueDate, dueTimeType, dueTime,
    frequency, recurrenceStartDate, weekdays,
    monthDay, yearMonth, yearDay,
    enableTime, recurrenceTime,
  )

  // ── styles ──
  const inp: React.CSSProperties = {
    padding: '7px 10px', fontSize: 13,
    border: '1px solid #D1D5DB', borderRadius: 8,
    outline: 'none', background: '#fff', color: '#1F2937', width: '100%', boxSizing: 'border-box',
  }
  const segBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '7px 0', fontSize: 13, fontWeight: active ? 600 : 400,
    border: '1px solid ' + (active ? '#F59E0B' : '#D1D5DB'),
    borderRadius: 8, cursor: 'pointer',
    background: active ? '#FEF3C7' : '#fff',
    color: active ? '#92400E' : '#374151',
  })
  const assigneeBtn = (mode: AssigneeMode): React.CSSProperties => ({
    flex: 1, padding: '7px 0', fontSize: 13, fontWeight: assigneeMode === mode ? 600 : 400,
    border: '1px solid ' + (assigneeMode === mode ? '#F59E0B' : '#D1D5DB'),
    borderRadius: 8, cursor: 'pointer',
    background: assigneeMode === mode ? '#FEF3C7' : '#fff',
    color: assigneeMode === mode ? '#92400E' : '#374151',
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
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #E5E7EB',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1F2937', margin: 0 }}>
            Новая задача
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#6B7280', lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ overflow: 'auto', flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Title */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 4 }}>НАЗВАНИЕ *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Что нужно сделать?"
              style={inp}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 4 }}>ОПИСАНИЕ</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Подробности (необязательно)"
              rows={2}
              style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Kind toggle */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>ТИП ЗАДАЧИ</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setKind('once')}      style={segBtn(kind === 'once')}>Разовая</button>
              <button type="button" onClick={() => setKind('recurring')} style={segBtn(kind === 'recurring')}>Регулярная</button>
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>ИСПОЛНИТЕЛЬ</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button type="button" onClick={() => setAssigneeMode('me')}         style={assigneeBtn('me')}>Себя</button>
              <button type="button" onClick={() => setAssigneeMode('person')}     style={assigneeBtn('person')}>Сотрудника</button>
              <button type="button" onClick={() => setAssigneeMode('department')} style={assigneeBtn('department')}>Отдел</button>
            </div>
            {assigneeMode === 'person' && (
              <PersonSelect
                value={assigneePersonId}
                onChange={id => setAssigneePersonId(id)}
                placeholder="Выберите исполнителя…"
                accentColor="#F59E0B"
              />
            )}
            {assigneeMode === 'department' && (
              <select value={assigneeDepartmentId} onChange={e => setAssigneeDepartmentId(e.target.value)} style={inp}>
                <option value="">Выберите отдел…</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
          </div>

          {/* ── ONE-TIME DUE ── */}
          {kind === 'once' && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>СРОК</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button type="button" onClick={() => setDueTimeType('allday')} style={segBtn(dueTimeType === 'allday')}>До конца дня</button>
                <button type="button" onClick={() => setDueTimeType('exact')}  style={segBtn(dueTimeType === 'exact')}>Точное время</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...inp, flex: 1 }} />
                {dueTimeType === 'exact' && (
                  <input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} style={{ ...inp, width: 110 }} />
                )}
              </div>
            </div>
          )}

          {/* ── RECURRING ── */}
          {kind === 'recurring' && (
            <>
              {/* Start date */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 4 }}>НАЧАТЬ С</label>
                <input type="date" value={recurrenceStartDate} onChange={e => setRecurrenceStartDate(e.target.value)} style={{ ...inp, maxWidth: 200 }} />
              </div>

              {/* Frequency cards */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>ЧАСТОТА</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {FREQ_OPTIONS.map(opt => {
                    const active = frequency === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFrequency(opt.value)}
                        style={{
                          padding: '10px 12px', textAlign: 'left',
                          border: '2px solid ' + (active ? '#F59E0B' : '#E5E7EB'),
                          borderRadius: 10, cursor: 'pointer',
                          background: active ? '#FFFBEB' : '#fff',
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: active ? '#92400E' : '#1F2937' }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{opt.sub}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Weekly weekdays */}
              {frequency === 'weekly' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>ДНИ НЕДЕЛИ</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {WEEKDAY_LABELS.map((label, i) => {
                      const wd = i + 1  // 1=Пн..7=Вс
                      const on = weekdays.includes(wd)
                      return (
                        <button
                          key={wd}
                          type="button"
                          onClick={() => toggleWeekday(wd)}
                          style={{
                            width: 36, height: 36, borderRadius: '50%', fontSize: 12, fontWeight: on ? 600 : 400,
                            border: '1px solid ' + (on ? '#F59E0B' : '#D1D5DB'),
                            background: on ? '#F59E0B' : '#fff',
                            color: on ? '#fff' : '#374151',
                            cursor: 'pointer',
                          }}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Monthly day */}
              {frequency === 'monthly' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 4 }}>ЧИСЛО МЕСЯЦА</label>
                  <input
                    type="number" min={1} max={31} value={monthDay}
                    onChange={e => setMonthDay(e.target.value)}
                    placeholder="1–31"
                    style={{ ...inp, maxWidth: 100 }}
                  />
                </div>
              )}

              {/* Yearly month + day */}
              {frequency === 'yearly' && (
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 2 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 4 }}>МЕСЯЦ</label>
                    <select value={yearMonth} onChange={e => setYearMonth(e.target.value)} style={inp}>
                      {MONTH_LABELS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 4 }}>ДЕНЬ</label>
                    <input
                      type="number" min={1} max={31} value={yearDay}
                      onChange={e => setYearDay(e.target.value)}
                      placeholder="1–31"
                      style={inp}
                    />
                  </div>
                </div>
              )}

              {/* Optional time */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                  <input type="checkbox" checked={enableTime} onChange={e => setEnableTime(e.target.checked)} />
                  С конкретным временем
                </label>
                {enableTime && (
                  <input type="time" value={recurrenceTime} onChange={e => setRecurrenceTime(e.target.value)}
                    style={{ ...inp, width: 110 }} />
                )}
              </div>

              {/* Series end */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>ЗАВЕРШЕНИЕ СЕРИИ</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {([
                    ['never',       'Никогда'],
                    ['until_date',  'До даты'],
                    ['after_count', 'После N'],
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
                    <span style={{ fontSize: 13, color: '#6B7280' }}>повторений</span>
                  </div>
                )}
              </div>

              {/* Preview */}
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#374151' }}>
                <span style={{ fontWeight: 600, color: '#6B7280', fontSize: 12 }}>БЛИЖАЙШИЙ СРОК: </span>
                {preview}
              </div>
            </>
          )}

          {/* Priority */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>ПРИОРИТЕТ</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIORITIES.map(p => {
                const active = priority === p.value
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    style={{
                      flex: 1, padding: '6px 0', fontSize: 12, fontWeight: active ? 700 : 400,
                      border: '1px solid ' + (active ? p.color : '#D1D5DB'),
                      borderRadius: 8, cursor: 'pointer',
                      background: active ? p.color + '18' : '#fff',
                      color: active ? p.color : '#6B7280',
                    }}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Watchers */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>НАБЛЮДАТЕЛИ</label>
            {watchers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {watchers.map(w => (
                  <span key={w.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '3px 8px', background: '#EFF6FF', borderRadius: 99,
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
              placeholder="Добавить наблюдателя…"
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
          padding: '14px 20px', borderTop: '1px solid #E5E7EB',
          display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0,
        }}>
          <button type="button" onClick={onClose}
            style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#374151' }}>
            Отмена
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
            {saving ? 'Создание…' : (kind === 'once' ? 'Создать задачу' : 'Создать серию')}
          </button>
        </div>
      </div>
    </div>
  )
}
