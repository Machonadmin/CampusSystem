'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { DateInput } from '@/components/ui/date-input'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { toastError, toastSuccess } from '@/components/ui/toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StudentOption {
  journey_id: string
  name: string
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

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChavrutaTeacherClient() {
  const t = useTranslations('chavruta')
  const tNav = useTranslations('navigation')
  const { lang } = useLang()
  const accent = getModuleColor('chavruta', 'primary')

  const [date, setDate] = useState<Date>(() => new Date())
  const [students, setStudents] = useState<StudentOption[]>([])
  const [studentsLoaded, setStudentsLoaded] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [featureOff, setFeatureOff] = useState(false)

  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)

  // Add-session form
  const [formStudent, setFormStudent] = useState('')
  const [formSummary, setFormSummary] = useState('')
  const [formPrivate, setFormPrivate] = useState('')
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

  async function addSession() {
    if (!formStudent || submitting) return
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
      setFormStudent('')
      setFormSummary('')
      setFormPrivate('')
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
    if (!window.confirm(t('confirm_delete'))) return
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
    try { return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : lang === 'he' ? 'he-IL' : 'en-US').format(n) }
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

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('chavruta'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(13,148,136,0.15)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('subtitle')}</div>
      </div>

      {!studentsLoaded ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('loading')}</div>
      ) : forbidden ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 16, fontSize: 13, color: 'var(--text-muted)',
        }}>{t('not_a_teacher')}</div>
      ) : featureOff ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          padding: 16, fontSize: 13, color: 'var(--text-muted)',
        }}>{t('feature_not_ready')}</div>
      ) : (
        <>
          {/* Date + Add form */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ maxWidth: 220 }}>
              <span style={label}>{t('date')}</span>
              <DateInput
                value={date}
                onChange={d => { if (d) setDate(d) }}
                locale={lang}
              />
            </div>

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
              <textarea
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
              <textarea
                value={formPrivate}
                onChange={e => setFormPrivate(e.target.value)}
                placeholder={t('private_notes_placeholder')}
                rows={2}
                style={{ ...input, resize: 'vertical', minHeight: 48 }}
              />
            </div>

            <div>
              <button
                type="button"
                onClick={addSession}
                disabled={!formStudent || submitting}
                style={{
                  padding: '9px 18px', fontSize: 13, fontWeight: 600,
                  background: (!formStudent || submitting) ? 'var(--border)' : accent,
                  color: (!formStudent || submitting) ? 'var(--text-faint)' : '#fff',
                  border: 'none', borderRadius: 8,
                  cursor: (!formStudent || submitting) ? 'not-allowed' : 'pointer',
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
                <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
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
