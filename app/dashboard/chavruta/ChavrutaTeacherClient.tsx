'use client'

import { useCallback, useEffect, useState } from 'react'
import { intlLocale } from '@/lib/i18n/format-date'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { DateInput } from '@/components/ui/date-input'
import { getModuleColor } from '@/lib/module-colors'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudentOption {
  journey_id: string
  name: string
}

/** Постоянная ученица моры («חברותא קבועה», пара в chavruta_pairs). */
interface RecurringStudent {
  id: string
  student_journey_id: string
  student_name: string
  weekday: number | null       // 0 = вс … 6 = сб
  start_time: string | null    // 'HH:MM:SS' по Израилю
  skipped: boolean             // на выбранную дату ответила «לא התקיים»
}

interface Session {
  id: string
  entry_date: string
  hours: number | null
  amount: number | null
  student_journey_id: string
  summary: string | null
  private_notes: string | null
  created_at: string
  student_name: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** 'HH:MM:SS' → 'HH:MM'. */
function hhmm(t: string | null): string {
  return (t ?? '').slice(0, 5)
}

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChavrutaTeacherClient({ initialDate }: { initialDate?: string }) {
  const t = useTranslations('chavruta')
  const tNav = useTranslations('navigation')
  const { lang } = useLang()
  const accent = getModuleColor('chavruta', 'primary')

  // ?date= из уведомления («היום יש לך חברותא», «התקיימה?») открывает нужный день.
  const [date, setDate] = useState<Date>(() => initialDate ? new Date(`${initialDate}T12:00:00`) : new Date())
  const [students, setStudents] = useState<StudentOption[]>([])
  const [studentsLoaded, setStudentsLoaded] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [featureOff, setFeatureOff] = useState(false)

  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  // «חברותות קבועות»: каждую неделю — одна кнопка «התקיים» вместо повторного ввода.
  const [recurring, setRecurring] = useState<RecurringStudent[]>([])
  const [scheduleSupported, setScheduleSupported] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [scheduleEditId, setScheduleEditId] = useState<string | null>(null)
  const [scheduleDay, setScheduleDay] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')

  // Add-session form
  const [formStudent, setFormStudent] = useState('')
  const [formSummary, setFormSummary] = useState('')
  const [formPrivate, setFormPrivate] = useState('')
  const [formRecurring, setFormRecurring] = useState(false)
  const [formDay, setFormDay] = useState('')
  const [formTime, setFormTime] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editSummary, setEditSummary] = useState('')
  const [editPrivate, setEditPrivate] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Load the students the logged-in teacher may record with (also our access gate)
  useEffect(() => {
    let alive = true
    fetch('/api/chavruta/students')
      .then(async r => {
        if (!alive) return
        if (r.status === 403) { setForbidden(true); return }
        if (r.status === 503) { setFeatureOff(true); return }
        if (!r.ok) return
        const b = await r.json()
        setStudents(b?.students ?? [])
      })
      .catch(() => {/* ignore */})
      .finally(() => { if (alive) setStudentsLoaded(true) })
    return () => { alive = false }
  }, [])

  const loadSessions = useCallback(async (ymd: string) => {
    setSessionsLoading(true)
    try {
      const res = await fetch(`/api/chavruta/sessions?date=${ymd}`)
      if (res.status === 403) { setForbidden(true); setSessions([]); return }
      if (res.status === 503) { setFeatureOff(true); setSessions([]); return }
      if (!res.ok) { setSessions([]); return }
      const b = await res.json()
      setSessions(b?.sessions ?? [])
    } catch {
      setSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  useEffect(() => { loadSessions(toYMD(date)) }, [date, loadSessions])

  const loadRecurring = useCallback(async (ymd: string) => {
    try {
      const res = await fetch(`/api/chavruta/recurring?date=${ymd}`)
      if (!res.ok) return
      const b = await res.json()
      setRecurring(b?.recurring ?? [])
      setScheduleSupported(!!b?.schedule_supported)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadRecurring(toYMD(date)) }, [date, loadRecurring])

  const dayOfDate = date.getDay()
  const recurringIds = new Set(recurring.map(r => r.student_journey_id))
  const loggedIds = new Set(sessions.map(s => s.student_journey_id))
  // Сначала — чей день совпал с выбранной датой, потом без дня, потом остальные.
  const rank = (r: RecurringStudent) => r.weekday === dayOfDate ? 0 : r.weekday == null ? 1 : 2
  const recurringSorted = recurring.slice().sort((a, b) =>
    rank(a) - rank(b) || hhmm(a.start_time).localeCompare(hhmm(b.start_time)) || a.student_name.localeCompare(b.student_name, 'he'))

  const scheduleLabel = (r: RecurringStudent): string =>
    r.weekday != null && r.start_time
      ? t('recurring_schedule').replace('{day}', t(`weekday_${r.weekday}`)).replace('{time}', hhmm(r.start_time))
      : t('recurring_no_schedule')

  /** «לא התקיים» — закрывает вопрос после встречи; на оплату не влияет. */
  async function setSkipped(r: RecurringStudent, skipped: boolean) {
    if (markingId) return
    setMarkingId(r.id)
    const ymd = toYMD(date)
    try {
      const res = skipped
        ? await fetch(`/api/chavruta/recurring/${r.id}/skip`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: ymd }),
          })
        : await fetch(`/api/chavruta/recurring/${r.id}/skip?date=${ymd}`, { method: 'DELETE' })
      if (!res.ok) { toastError(t('error')); return }
      await loadRecurring(ymd)
    } catch {
      toastError(t('error'))
    } finally {
      setMarkingId(null)
    }
  }

  function startScheduleEdit(r: RecurringStudent) {
    setScheduleEditId(r.id)
    setScheduleDay(r.weekday != null ? String(r.weekday) : String(dayOfDate))
    setScheduleTime(hhmm(r.start_time))
  }

  async function saveSchedule(r: RecurringStudent) {
    if (!scheduleDay || !scheduleTime || markingId) return
    setMarkingId(r.id)
    try {
      const res = await fetch(`/api/chavruta/recurring/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekday: Number(scheduleDay), start_time: scheduleTime }),
      })
      if (!res.ok) { toastError(t('error')); return }
      setScheduleEditId(null)
      toastSuccess(t('saved'))
      await loadRecurring(toYMD(date))
    } catch {
      toastError(t('error'))
    } finally {
      setMarkingId(null)
    }
  }

  /** Одна кнопка «התקיים» у постоянной ученицы — записывает встречу на выбранную дату. */
  async function markHappened(r: RecurringStudent) {
    if (markingId) return
    setMarkingId(r.id)
    try {
      const res = await fetch('/api/chavruta/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_journey_id: r.student_journey_id, entry_date: toYMD(date) }),
      })
      if (!res.ok) { toastError(t('error')); return }
      toastSuccess(t('added'))
      await loadSessions(toYMD(date))
    } catch {
      toastError(t('error'))
    } finally {
      setMarkingId(null)
    }
  }

  async function removeRecurring(r: RecurringStudent) {
    if (!(await confirmDialog({
      message: t('recurring_confirm_remove').replace('{name}', r.student_name || '—'),
      tone: 'danger',
      confirmLabel: t('recurring_remove'),
    }))) return
    try {
      const res = await fetch(`/api/chavruta/recurring/${r.id}`, { method: 'DELETE' })
      if (!res.ok) { toastError(t('error')); return }
      toastSuccess(t('recurring_removed'))
      await loadRecurring(toYMD(date))
    } catch {
      toastError(t('error'))
    }
  }

  // «קבועה» с днём и временем: без времени не будет вопроса после встречи.
  const needsSchedule = formRecurring && scheduleSupported && !recurringIds.has(formStudent)
  const formReady = !!formStudent && (!needsSchedule || (!!formDay && !!formTime))

  async function addSession() {
    if (!formReady || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/chavruta/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_journey_id: formStudent,
          entry_date: toYMD(date),
          summary: formSummary.trim() || null,
          private_notes: formPrivate.trim() || null,
        }),
      })
      if (!res.ok) { toastError(t('error')); return }
      // «קבועה» — после записанной встречи: если не вышло, встреча всё равно записана.
      if (formRecurring && !recurringIds.has(formStudent)) {
        const rr = await fetch('/api/chavruta/recurring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_journey_id: formStudent,
            ...(needsSchedule ? { weekday: Number(formDay), start_time: formTime } : {}),
          }),
        }).catch(() => null)
        if (!rr || !rr.ok) toastError(t('recurring_mark_failed'))
        await loadRecurring(toYMD(date))
      }
      setFormStudent('')
      setFormSummary('')
      setFormPrivate('')
      setFormRecurring(false)
      setFormDay('')
      setFormTime('')
      toastSuccess(t('added'))
      await loadSessions(toYMD(date))
    } catch {
      toastError(t('error'))
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(s: Session) {
    setEditingId(s.id)
    setEditSummary(s.summary ?? '')
    setEditPrivate(s.private_notes ?? '')
  }

  async function saveEdit(id: string) {
    if (savingEdit) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/chavruta/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: editSummary.trim() || null,
          private_notes: editPrivate.trim() || null,
        }),
      })
      if (!res.ok) { toastError(t('error')); return }
      setEditingId(null)
      toastSuccess(t('saved'))
      await loadSessions(toYMD(date))
    } catch {
      toastError(t('error'))
    } finally {
      setSavingEdit(false)
    }
  }

  async function removeSession(id: string) {
    if (!(await confirmDialog({ message: t('confirm_delete'), tone: 'danger' }))) return
    try {
      const res = await fetch(`/api/chavruta/sessions/${id}`, { method: 'DELETE' })
      if (!res.ok) { toastError(t('error')); return }
      toastSuccess(t('deleted'))
      await loadSessions(toYMD(date))
    } catch {
      toastError(t('error'))
    }
  }

  const fmtAmount = (n: number | null): string => {
    if (n === null || n === undefined) return ''
    try { return new Intl.NumberFormat(intlLocale(lang)).format(n) }
    catch { return String(n) }
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13,
    border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none',
    color: 'var(--text)', boxSizing: 'border-box', background: 'var(--surface)',
  }
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />

      <ModuleHeader module="chavruta" title={t('title')} subtitle={t('subtitle')} />

      {!studentsLoaded ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('loading')}</div>
      ) : forbidden ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
          padding: 16, fontSize: 13, color: 'var(--text-muted)',
        }}>{t('not_a_teacher')}</div>
      ) : featureOff ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
          padding: 16, fontSize: 13, color: 'var(--text-muted)',
        }}>{t('feature_not_ready')}</div>
      ) : (
        <>
          {/* Date */}
          <div style={{ maxWidth: 220 }}>
            <span style={label}>{t('date')}</span>
            <DateInput
              value={date}
              onChange={d => { if (d) setDate(d) }}
              locale={lang}
            />
          </div>

          {/* Recurring: one tap per week */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{t('recurring_title')}</h2>
            {recurring.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('recurring_empty')}</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{t('recurring_hint')}</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {recurringSorted.map(r => {
                    const logged = loggedIds.has(r.student_journey_id)
                    const busy = markingId === r.id
                    const locked = !!markingId || sessionsLoading
                    const editing = scheduleEditId === r.id
                    const linkBtn: React.CSSProperties = {
                      fontSize: 12, color: 'var(--text-faint)', background: 'none', border: 'none',
                      cursor: 'pointer', padding: '2px 4px', whiteSpace: 'nowrap',
                    }
                    return (
                      <div key={r.id} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{r.student_name || '—'}</div>
                            {scheduleSupported && (
                              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 1 }}>{scheduleLabel(r)}</div>
                            )}
                          </div>
                          {logged ? (
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--success)', whiteSpace: 'nowrap' }}>✓ {t('recurring_logged')}</span>
                          ) : r.skipped ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{t('recurring_not_happened')}</span>
                              <button type="button" onClick={() => setSkipped(r, false)} disabled={locked} style={linkBtn}>{t('recurring_undo')}</button>
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => markHappened(r)}
                                disabled={locked}
                                style={{
                                  padding: '6px 14px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                                  background: locked ? 'var(--border)' : accent,
                                  color: locked ? 'var(--text-faint)' : '#fff',
                                  border: 'none', borderRadius: 8,
                                  cursor: locked ? 'not-allowed' : 'pointer',
                                }}
                              >{busy ? t('saving') : t('recurring_happened')}</button>
                              {scheduleSupported && (
                                <button
                                  type="button"
                                  onClick={() => setSkipped(r, true)}
                                  disabled={locked}
                                  style={{
                                    padding: '6px 12px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                                    background: 'var(--surface-2)', color: 'var(--text-muted)',
                                    border: '1px solid var(--border-strong)', borderRadius: 8,
                                    cursor: locked ? 'not-allowed' : 'pointer',
                                  }}
                                >{t('recurring_not_happened')}</button>
                              )}
                            </span>
                          )}
                        </div>

                        {editing ? (
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                            <div style={{ flex: '1 1 120px' }}>
                              <span style={label}>{t('weekday')}</span>
                              <select value={scheduleDay} onChange={e => setScheduleDay(e.target.value)} style={input}>
                                {[0, 1, 2, 3, 4, 5, 6].map(d => <option key={d} value={d}>{t(`weekday_${d}`)}</option>)}
                              </select>
                            </div>
                            <div style={{ flex: '1 1 100px' }}>
                              <span style={label}>{t('time')}</span>
                              <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} style={input} />
                            </div>
                            <button
                              type="button"
                              onClick={() => saveSchedule(r)}
                              disabled={!scheduleTime || locked}
                              style={{
                                padding: '8px 14px', fontSize: 12, fontWeight: 600,
                                background: (!scheduleTime || locked) ? 'var(--border)' : accent,
                                color: (!scheduleTime || locked) ? 'var(--text-faint)' : '#fff',
                                border: 'none', borderRadius: 8, cursor: (!scheduleTime || locked) ? 'not-allowed' : 'pointer',
                              }}
                            >{busy ? t('saving') : t('save')}</button>
                            <button
                              type="button"
                              onClick={() => setScheduleEditId(null)}
                              style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                            >{t('cancel')}</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                            {scheduleSupported && (
                              <button type="button" onClick={() => startScheduleEdit(r)} style={linkBtn}>{t('recurring_edit_schedule')}</button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeRecurring(r)}
                              aria-label={`${t('recurring_remove')}: ${r.student_name}`}
                              style={linkBtn}
                            >× {t('recurring_remove')}</button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* Add form */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'grid', gap: 12 }}>
            <div>
              <span style={label}>{t('student')}</span>
              <select
                value={formStudent}
                onChange={e => setFormStudent(e.target.value)}
                style={input}
              >
                <option value="">{t('select_student')}</option>
                {students.map(s => (
                  <option key={s.journey_id} value={s.journey_id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <span style={label}>{t('what_we_learned')}</span>
              <textarea aria-label={t('what_we_learned_placeholder')}
                value={formSummary}
                onChange={e => setFormSummary(e.target.value)}
                placeholder={t('what_we_learned_placeholder')}
                rows={2}
                style={{ ...input, resize: 'vertical', minHeight: 48 }}
              />
            </div>

            <div>
              <span style={label}>{t('private_notes')}</span>
              <div style={{ fontSize: 11, color: 'var(--danger, #B91C1C)', marginBottom: 4 }}>{t('private_notes_hint')}</div>
              <textarea aria-label={t('private_notes_placeholder')}
                value={formPrivate}
                onChange={e => setFormPrivate(e.target.value)}
                placeholder={t('private_notes_placeholder')}
                rows={2}
                style={{ ...input, resize: 'vertical', minHeight: 48 }}
              />
            </div>

            {formStudent && !recurringIds.has(formStudent) && (
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formRecurring}
                    onChange={e => {
                      setFormRecurring(e.target.checked)
                      if (e.target.checked && !formDay) setFormDay(String(dayOfDate))
                    }}
                    style={{ marginTop: 2 }}
                  />
                  <span>{scheduleSupported ? t('mark_recurring') : t('mark_recurring_no_schedule')}</span>
                </label>
                {needsSchedule && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingInlineStart: 24 }}>
                    <div style={{ flex: '1 1 120px', maxWidth: 200 }}>
                      <span style={label}>{t('weekday')}</span>
                      <select value={formDay} onChange={e => setFormDay(e.target.value)} style={input}>
                        {[0, 1, 2, 3, 4, 5, 6].map(d => <option key={d} value={d}>{t(`weekday_${d}`)}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: '1 1 100px', maxWidth: 160 }}>
                      <span style={label}>{t('time')}</span>
                      <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} style={input} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <button
                type="button"
                onClick={addSession}
                disabled={!formReady || submitting}
                style={{
                  padding: '9px 18px', fontSize: 13, fontWeight: 600,
                  background: (!formReady || submitting) ? 'var(--border)' : accent,
                  color: (!formReady || submitting) ? 'var(--text-faint)' : '#fff',
                  border: 'none', borderRadius: 8,
                  cursor: (!formReady || submitting) ? 'not-allowed' : 'pointer',
                }}
              >{submitting ? t('saving') : t('add_session')}</button>
            </div>
          </div>

          {/* Sessions for the date */}
          {sessionsLoading ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('loading')}</div>
          ) : sessions.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('no_sessions')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {sessions.map(s => (
                <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{s.student_name}</div>
                    {s.amount !== null && s.amount !== undefined && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: accent, whiteSpace: 'nowrap' }}>
                        {t('amount')}: {fmtAmount(s.amount)}
                      </div>
                    )}
                  </div>

                  {editingId === s.id ? (
                    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                      <div>
                        <span style={label}>{t('what_we_learned')}</span>
                        <textarea
                          value={editSummary}
                          onChange={e => setEditSummary(e.target.value)}
                          rows={2}
                          style={{ ...input, resize: 'vertical', minHeight: 48 }}
                        />
                      </div>
                      <div>
                        <span style={label}>{t('private_notes')}</span>
                        <div style={{ fontSize: 11, color: 'var(--danger, #B91C1C)', marginBottom: 4 }}>{t('private_notes_hint')}</div>
                        <textarea
                          value={editPrivate}
                          onChange={e => setEditPrivate(e.target.value)}
                          rows={2}
                          style={{ ...input, resize: 'vertical', minHeight: 48 }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => saveEdit(s.id)}
                          disabled={savingEdit}
                          style={{
                            padding: '7px 16px', fontSize: 12, fontWeight: 600,
                            background: accent, color: '#fff', border: 'none', borderRadius: 8,
                            cursor: savingEdit ? 'not-allowed' : 'pointer',
                          }}
                        >{savingEdit ? t('saving') : t('save')}</button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          style={{ padding: '7px 14px', fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                        >{t('cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {s.summary && (
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, whiteSpace: 'pre-wrap' }}>{s.summary}</div>
                      )}
                      {s.private_notes && (
                        <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: 'var(--danger-tint, #FEF2F2)', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger, #B91C1C)', marginBottom: 2 }}>{t('private_notes')}</div>
                          <div style={{ fontSize: 12.5, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{s.private_notes}</div>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          style={{ fontSize: 12, fontWeight: 600, color: accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >{t('edit')}</button>
                        <button
                          type="button"
                          onClick={() => removeSession(s.id)}
                          style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger, #DC2626)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >{t('delete')}</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
