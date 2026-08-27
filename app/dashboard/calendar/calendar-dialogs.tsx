'use client'

// Диалоги календаря: детали личного события, детали дня, форма создания/
// редактирования встречи и просмотр встречи. Вынесено из CalendarClient.tsx
// для разгрузки монолита; поведение не менялось.
import { useState, useEffect } from 'react'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'
import { formatHebrewDate } from '@/lib/calendar/hebrew'
import { isBlocked, mergeDayEvents, minutesBetween } from '@/lib/calendar/calendar'
import type { ScheduleInstance } from '@/lib/calendar/schedule'
import type { BirthdayInstance } from '@/lib/calendar/birthday'
import type { Appointment, Block, Lesson, Task, CalEvent, StudentOption, Status } from './calendar-types'
import { Overlay, Field } from './calendar-details'
import {
  isoTime, subjectLabel, scheduleSubjectLabel, statusStyle,
  dialog, dialogTitle, input, btnGhost, btnPrimary, statusBtn,
  dayRowBtn, dayRowKind, dayRowTime, dayRowTitle,
  LESSON_BG, LESSON_FG, LESSON_ACCENT, SCHEDULE_BG, SCHEDULE_FG, SCHEDULE_ACCENT,
  TASK_BG, TASK_FG, TASK_ACCENT, BIRTHDAY_BG, BIRTHDAY_FG, BIRTHDAY_ACCENT,
} from './calendar-utils'

// ─────────────────────────────────────────────
// Детали личного события календаря
// ─────────────────────────────────────────────
export function CalEventDetail({ ev, onClose, onDeleted }: { ev: CalEvent; onClose: () => void; onDeleted: () => void }) {
  const tAdd = useTranslations('add_to_calendar')
  const { lang } = useLang()
  const [deleting, setDeleting] = useState(false)

  async function remove() {
    setDeleting(true)
    try {
      await fetch(`/api/calendar/events/${ev.id}`, { method: 'DELETE' })
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div onClick={() => !deleting && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, width: 'min(420px,100%)', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>📅 {ev.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>
          {formatDate(ev.event_date, lang)}{!ev.all_day && ev.event_time ? ` · ${ev.event_time.slice(0, 5)}` : ''}
        </div>
        {ev.reminder_at && <div style={{ fontSize: 12, color: '#6366F1', fontWeight: 600 }}>🔔 {tAdd('has_reminder')}</div>}
        {ev.notes && <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{ev.notes}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
          <SubmitButton onClick={remove} loading={deleting} loadingLabel={tAdd('deleting')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
            {tAdd('delete')}
          </SubmitButton>
          <div style={{ display: 'flex', gap: 8 }}>
            {ev.link && <a href={ev.link} style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-strong)', textDecoration: 'none', padding: '8px 14px' }}>{tAdd('open_link')}</a>}
            <button onClick={onClose} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>{tAdd('cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Детали одного дня — вся лента событий выбранной даты
// ─────────────────────────────────────────────
export function DayDetail({
  dateISO, appointments, lessons, schedule, tasks, birthdays, calEvents, blocks,
  locale, isRTL, hebrewDates, primary, light, lang,
  onClose, onNew, onToggleDayOff, onOpen, onOpenLesson, onOpenTask, onOpenSchedule, onOpenEvent, t,
}: {
  dateISO: string
  appointments: Appointment[]
  lessons: Lesson[]
  schedule: ScheduleInstance[]
  tasks: Task[]
  birthdays: BirthdayInstance[]
  calEvents: CalEvent[]
  blocks: Block[]
  locale: string
  isRTL: boolean
  hebrewDates: boolean
  primary: string
  light: string
  lang: string
  onClose: () => void
  onNew: () => void
  onToggleDayOff: (d: string) => void
  onOpen: (a: Appointment) => void
  onOpenLesson: (l: Lesson) => void
  onOpenTask: (task: Task) => void
  onOpenSchedule: (s: ScheduleInstance) => void
  onOpenEvent: (e: CalEvent) => void
  t: (k: string, f?: string) => string
}) {
  const tCommon = useTranslations('common')
  // ПЕРЕИСПОЛЬЗУЕМ уже загруженные данные — никаких новых запросов. Тот же
  // mergeDayEvents, что и в сетке, но только для одной даты dateISO.
  const events = mergeDayEvents(appointments, lessons, schedule, tasks, birthdays, dateISO, calEvents)
  const blocked = isBlocked(blocks, dateISO)
  const label = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${dateISO}T00:00:00Z`))

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 65, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} dir={isRTL ? 'rtl' : 'ltr'} style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, width: 'min(460px,100%)', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>{label}</div>
            {hebrewDates && (
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-faint)', marginTop: 2 }}>{formatHebrewDate(dateISO)}</div>
            )}
            {blocked && (
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn)', marginTop: 4 }}>{t('day_off')}</div>
            )}
          </div>
          <button onClick={onClose} aria-label={tCommon('close')} style={{ fontSize: 18, lineHeight: 1, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>×</button>
        </div>

        {events.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('empty_day')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {events.map(ev => {
              if (ev.kind === 'lesson' && ev.lesson) {
                const l = ev.lesson
                return (
                  <button key={`l-${l.id}`} onClick={() => onOpenLesson(l)} style={dayRowBtn(isRTL, LESSON_BG, LESSON_FG, LESSON_ACCENT)}>
                    <span style={dayRowTime}>{ev.time || t('all_day')}</span>
                    <span style={dayRowTitle}>{subjectLabel(l, lang)} · {l.class_group_name}</span>
                    <span style={dayRowKind}>{t('lesson')}</span>
                  </button>
                )
              }
              if (ev.kind === 'schedule' && ev.schedule) {
                const s = ev.schedule
                return (
                  <button key={`s-${s.slot_id}-${s.dateISO}`} onClick={() => onOpenSchedule(s)} style={dayRowBtn(isRTL, SCHEDULE_BG, SCHEDULE_FG, SCHEDULE_ACCENT)}>
                    <span style={dayRowTime}>{ev.time || t('all_day')}</span>
                    <span style={dayRowTitle}>{scheduleSubjectLabel(s, lang)} · {s.class_group_name}</span>
                    <span style={dayRowKind}>{t('planned_lesson')}</span>
                  </button>
                )
              }
              if (ev.kind === 'task' && ev.task) {
                const tk = ev.task
                return (
                  <button key={`t-${tk.id}`} onClick={() => onOpenTask(tk)} style={dayRowBtn(isRTL, TASK_BG, TASK_FG, TASK_ACCENT)}>
                    <span style={dayRowTime}>{ev.time || t('all_day')}</span>
                    <span style={dayRowTitle}>{tk.title}</span>
                    <span style={dayRowKind}>{t('task')}</span>
                  </button>
                )
              }
              if (ev.kind === 'event' && ev.event) {
                const ce = ev.event as CalEvent
                return (
                  <button key={`e-${ce.id}`} onClick={() => onOpenEvent(ce)} style={dayRowBtn(isRTL, 'var(--accent-tint)', 'var(--violet)', '#6366F1')}>
                    <span style={dayRowTime}>{ev.time || t('all_day')}</span>
                    <span style={dayRowTitle}>📅 {ce.title}</span>
                    <span style={dayRowKind}>{t('event')}</span>
                  </button>
                )
              }
              if (ev.kind === 'birthday' && ev.birthday) {
                const b = ev.birthday
                return (
                  <div key={`b-${b.dateISO}`} style={{ ...dayRowBtn(isRTL, BIRTHDAY_BG, BIRTHDAY_FG, BIRTHDAY_ACCENT), cursor: 'default' }}>
                    <span style={dayRowTime}>{t('all_day')}</span>
                    <span style={dayRowTitle}>🎂 {t('birthday')} · {b.age}</span>
                    <span style={dayRowKind}>{t('birthday')}</span>
                  </div>
                )
              }
              const a = ev.appointment!
              const st = statusStyle(a.status, primary, light)
              return (
                <button key={`a-${a.id}`} onClick={() => onOpen(a)} style={{ ...dayRowBtn(isRTL, st.bg, st.color, st.color), textDecoration: st.strike ? 'line-through' : 'none' }}>
                  <span style={dayRowTime}>{isoTime(a.starts_at)}</span>
                  <span style={dayRowTitle}>{a.title}</span>
                  <span style={dayRowKind}>{t(`status.${a.status}`)}</span>
                </button>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={onNew} style={{ fontSize: 13, fontWeight: 600, color: primary, background: light, border: `1px solid ${primary}`, borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>
            + {t('new_appointment')}
          </button>
          <button onClick={() => onToggleDayOff(dateISO)} style={{ fontSize: 13, fontWeight: 500, color: blocked ? 'var(--warn)' : 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '9px 14px', cursor: 'pointer' }}>
            {blocked ? t('remove_day_off') : t('mark_day_off')}
          </button>
        </div>
      </div>
    </div>
  )
}



// ─────────────────────────────────────────────
// Диалог создания / редактирования
// ─────────────────────────────────────────────

export function AppointmentForm({
  editing, defaultDate, onClose, onSaved, t, tCommon, isRTL, primary,
}: {
  editing: Appointment | null
  defaultDate: string
  onClose: () => void
  onSaved: () => void
  t: (k: string, f?: string) => string
  tCommon: (k: string, f?: string) => string
  isRTL: boolean
  primary: string
}) {
  const [title, setTitle] = useState(editing?.title ?? '')
  const [reason, setReason] = useState(editing?.reason ?? '')
  const [date, setDate] = useState(editing ? editing.starts_at.slice(0, 10) : defaultDate)
  const [start, setStart] = useState(editing ? isoTime(editing.starts_at) : '09:00')
  const [end, setEnd] = useState(editing ? isoTime(editing.ends_at) : '09:30')
  const [journeyId, setJourneyId] = useState<string | null>(editing?.journey_id ?? null)
  const [studentLabel, setStudentLabel] = useState<string>(
    editing?.student_name || editing?.student_hebrew_name || '',
  )

  const [studentSearch, setStudentSearch] = useState('')
  const [studentOpts, setStudentOpts] = useState<StudentOption[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  // Приглашённые участники — ЛЮБЫЕ persons (не только студенты).
  const [invitees, setInvitees] = useState<{ id: string; name: string }[]>(
    (editing?.attendees ?? []).map(x => ({ id: x.person_id, name: x.name ?? '' })),
  )
  const [inviteeSearch, setInviteeSearch] = useState('')
  const [inviteeOpts, setInviteeOpts] = useState<{ id: string; full_name: string | null }[]>([])
  const [inviteeOpen, setInviteeOpen] = useState(false)

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Поиск студентов с дебаунсом.
  useEffect(() => {
    if (!pickerOpen) return
    const h = setTimeout(async () => {
      try {
        const res = await fetch(`/api/persons/students?pageSize=20&search=${encodeURIComponent(studentSearch)}`)
        if (!res.ok) return
        const b = await res.json()
        setStudentOpts(b.students ?? [])
      } catch { /* оставляем прежний список */ }
    }, 250)
    return () => clearTimeout(h)
  }, [studentSearch, pickerOpen])

  // Поиск любых persons для приглашения.
  useEffect(() => {
    if (!inviteeOpen) return
    const h = setTimeout(async () => {
      try {
        const res = await fetch(`/api/persons?search=${encodeURIComponent(inviteeSearch)}`)
        if (!res.ok) return
        const b = await res.json()
        setInviteeOpts(b.people ?? [])
      } catch { /* keep */ }
    }, 250)
    return () => clearTimeout(h)
  }, [inviteeSearch, inviteeOpen])

  async function submit() {
    setErr(null)
    if (!title.trim()) { setErr(t('err_title_required')); return }
    if (end <= start) { setErr(t('err_end_after_start')); return }
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        journey_id: journeyId,
        starts_at: `${date}T${start}`,
        ends_at: `${date}T${end}`,
        reason: reason.trim() || null,
        attendee_person_ids: invitees.map(i => i.id),
      }
      const res = editing
        ? await fetch(`/api/calendar/appointments/${editing.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/calendar/appointments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      if (res.status === 409) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('overlap_error')); return }
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('load_error')); return }
      onSaved()
    } catch {
      setErr(t('load_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={dialog} onClick={e => e.stopPropagation()} dir={isRTL ? 'rtl' : 'ltr'}>
        <h2 style={dialogTitle}>{editing ? t('edit_appointment') : t('new_appointment')}</h2>

        <Field label={t('form_title')}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('form_title_ph')} style={input} autoFocus />
        </Field>

        <Field label={t('form_student')}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => { setPickerOpen(o => !o); if (!pickerOpen) setStudentSearch('') }}
              style={{ ...input, textAlign: isRTL ? 'right' : 'left', cursor: 'pointer', color: studentLabel ? 'var(--text)' : 'var(--text-faint)' }}
            >
              {studentLabel || t('form_student_none')}
            </button>
            {journeyId && (
              <button
                type="button"
                onClick={() => { setJourneyId(null); setStudentLabel('') }}
                aria-label={tCommon('close')}
                style={{ position: 'absolute', top: 8, insetInlineEnd: 10, fontSize: 12, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
              >✕</button>
            )}
            {pickerOpen && (
              <div style={{
                position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0, zIndex: 20,
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                maxHeight: 220, overflowY: 'auto',
              }}>
                <input
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder={t('form_student_search')}
                  style={{ ...input, borderRadius: 0, border: 'none', borderBottom: '1px solid var(--surface-2)' }}
                  autoFocus
                />
                {studentOpts.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 12px' }}>{t('form_student_empty')}</div>
                ) : studentOpts.map(s => (
                  <button
                    key={s.journey_id}
                    type="button"
                    onClick={() => {
                      setJourneyId(s.journey_id)
                      setStudentLabel(s.hebrew_name || s.full_name || '')
                      setPickerOpen(false)
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: isRTL ? 'right' : 'left',
                      fontSize: 13, color: 'var(--text)', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    {s.hebrew_name || s.full_name || '—'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>

        <Field label={t('form_invitees')}>
          {invitees.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {invitees.map(iv => (
                <span key={iv.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--accent-tint)', borderRadius: 99, padding: '4px 6px 4px 11px' }}>
                  {iv.name || '—'}
                  <button type="button" onClick={() => setInvitees(prev => prev.filter(x => x.id !== iv.id))} aria-label={tCommon('delete')} style={{ border: 'none', background: 'rgba(0,0,0,0.06)', color: 'inherit', width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => { setInviteeOpen(o => !o); if (!inviteeOpen) setInviteeSearch('') }}
              style={{ ...input, textAlign: isRTL ? 'right' : 'left', cursor: 'pointer', color: 'var(--text-faint)' }}
            >
              {t('form_invitees_none')}
            </button>
            {inviteeOpen && (
              <div style={{ position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto' }}>
                <input value={inviteeSearch} onChange={e => setInviteeSearch(e.target.value)} placeholder={t('form_invitees_search')} style={{ ...input, borderRadius: 0, border: 'none', borderBottom: '1px solid var(--surface-2)' }} autoFocus />
                {inviteeOpts.filter(o => !invitees.some(iv => iv.id === o.id)).length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 12px' }}>{t('form_invitees_empty')}</div>
                ) : inviteeOpts.filter(o => !invitees.some(iv => iv.id === o.id)).map(o => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => { setInvitees(prev => [...prev, { id: o.id, name: o.full_name || '' }]); setInviteeOpen(false) }}
                    style={{ display: 'block', width: '100%', textAlign: isRTL ? 'right' : 'left', fontSize: 13, color: 'var(--text)', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    {o.full_name || '—'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{t('invitees_hint')}</div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Field label={t('form_date')}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
          </Field>
          <Field label={t('form_start')}>
            <input type="time" value={start} onChange={e => setStart(e.target.value)} style={input} />
          </Field>
          <Field label={t('form_end')}>
            <input type="time" value={end} onChange={e => setEnd(e.target.value)} style={input} />
          </Field>
        </div>

        <Field label={t('form_reason')}>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder={t('form_reason_ph')} rows={2} style={{ ...input, resize: 'vertical' }} />
        </Field>

        {err && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={btnGhost}>{tCommon('cancel')}</button>
          <SubmitButton onClick={submit} loading={saving} loadingLabel={tCommon('loading')} style={{ ...btnPrimary(primary), opacity: saving ? 0.6 : 1 }}>
            {tCommon('save')}
          </SubmitButton>
        </div>
      </div>
    </Overlay>
  )
}

// ─────────────────────────────────────────────
// Диалог просмотра встречи
// ─────────────────────────────────────────────

export function AppointmentDetail({
  a, onClose, onEdit, onStatus, onDelete, onRespond, t, tCommon, locale, primary, hebrewDates,
}: {
  a: Appointment
  onClose: () => void
  onEdit: () => void
  onStatus: (s: Status) => void
  onDelete: () => void
  onRespond: (action: 'accept' | 'decline') => void
  t: (k: string, f?: string) => string
  tCommon: (k: string, f?: string) => string
  locale: string
  primary: string
  hebrewDates: boolean
}) {
  const st = statusStyle(a.status, primary, 'var(--info-tint)')
  const dayISO = a.starts_at.slice(0, 10)
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${dayISO}T00:00:00Z`))
  const mins = minutesBetween(a.starts_at, a.ends_at)
  const who = a.student_name || a.student_hebrew_name
  const isParticipant = a.role === 'participant'
  const providerWho = a.provider_name || a.provider_hebrew_name

  return (
    <Overlay onClose={onClose}>
      <div style={dialog} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ ...dialogTitle, marginBottom: 4, textDecoration: st.strike ? 'line-through' : 'none' }}>{a.title}</h2>
          <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
            {t(`status.${a.status}`)}
          </span>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 8, textTransform: 'capitalize' }}>{dateLabel}</div>
        {hebrewDates && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{formatHebrewDate(dayISO)}</div>
        )}
        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>
          {isoTime(a.starts_at)}–{isoTime(a.ends_at)} · {mins} {t('minutes')}
        </div>
        {/* Для participant студент — это сам пользователь; показываем, КТО назначил. */}
        {isParticipant
          ? <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}><b>{t('booked_by')}:</b> {providerWho ?? '—'}</div>
          : who && <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}><b>{t('form_student')}:</b> {who}</div>}
        {a.reason && <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}><b>{t('form_reason')}:</b> {a.reason}</div>}

        {a.attendees && a.attendees.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', marginBottom: 5 }}>{t('attendees_title')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {a.attendees.map(at => (
                <span key={at.person_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text)', background: 'var(--surface-2)', borderRadius: 99, padding: '3px 10px' }}>
                  {at.name || '—'}
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: at.status === 'accepted' ? 'var(--success)' : at.status === 'declined' ? 'var(--danger)' : at.status === 'pending_approval' ? 'var(--warn)' : 'var(--text-faint)' }}>· {t(`att_${at.status}`)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {(a.my_attendance_status === 'invited' || a.my_attendance_status === 'pending_approval') && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--accent-tint)', borderRadius: 8 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text)', marginBottom: 8 }}>{t('my_pending_prompt')} <b>{a.title}</b></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onRespond('accept')} style={statusBtn('var(--success)', 'var(--success-tint)')}>{t('respond_approve')}</button>
              <button onClick={() => onRespond('decline')} style={statusBtn('var(--danger)', 'var(--danger-tint)')}>{t('respond_decline')}</button>
            </div>
          </div>
        )}

        {isParticipant ? (
          // READ-ONLY: назначено мне кем-то другим — без правки/удаления/статусов.
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, borderTop: '1px solid var(--surface-2)', paddingTop: 14 }}>
            <button onClick={onClose} style={btnGhost}>{tCommon('back')}</button>
          </div>
        ) : (
          <>
            {/* Status actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
              <button onClick={() => onStatus('completed')} style={statusBtn('var(--success)', 'var(--success-tint)')}>{t('mark_completed')}</button>
              <button onClick={() => onStatus('cancelled')} style={statusBtn('var(--text-muted)', 'var(--surface-2)')}>{t('mark_cancelled')}</button>
              <button onClick={() => onStatus('no_show')} style={statusBtn('var(--warn)', 'var(--warn-tint)')}>{t('mark_no_show')}</button>
              {a.status !== 'scheduled' && (
                <button onClick={() => onStatus('scheduled')} style={statusBtn(primary, 'var(--info-tint)')}>{t('mark_scheduled')}</button>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16, borderTop: '1px solid var(--surface-2)', paddingTop: 14 }}>
              <button onClick={onDelete} style={{ ...btnGhost, color: 'var(--danger)' }}>{tCommon('delete')}</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onClose} style={btnGhost}>{tCommon('back')}</button>
                <button onClick={onEdit} style={btnPrimary(primary)}>{tCommon('edit')}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </Overlay>
  )
}
