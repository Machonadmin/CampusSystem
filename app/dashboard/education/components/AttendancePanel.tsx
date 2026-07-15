'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import LessonNotes from '@/components/education/LessonNotes'
import type { LessonItem } from './LessonsJournalTab'

// ── Типы ──────────────────────────────────────────────────────────────────────

type AttendanceStatus = 'present' | 'late' | 'absent'

interface StudentEntry {
  journey_id: string
  full_name: string | null
  hebrew_name: string | null
  status: AttendanceStatus | null
  marked_by: string | null
  marked_at: string | null
  is_guest?: boolean
}

interface GuestResult { id: string; name: string }

interface Props {
  lesson: LessonItem
  canMarkAttendance: boolean
  accentColor: string
  onClose: () => void
  onSaved: () => void
}

// ── Цвета статусов ────────────────────────────────────────────────────────────

const STATUS_ORDER: AttendanceStatus[] = ['present', 'late', 'absent']

// Семантические токены темы: present=success, late=warn, absent=danger.
const STATUS_COLORS: Record<AttendanceStatus, { color: string; bg: string; border: string }> = {
  present: { color: 'var(--success)', bg: 'var(--success-tint)', border: 'var(--success)' },
  late:    { color: 'var(--warn)',    bg: 'var(--warn-tint)',    border: 'var(--warn)' },
  absent:  { color: 'var(--danger)',  bg: 'var(--danger-tint)',  border: 'var(--danger)' },
}

function formatDate(lang: string, iso: string): string {
  const locale = lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-US' : 'ru-RU'
  return new Date(iso + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Компонент ─────────────────────────────────────────────────────────────────

export default function AttendancePanel({ lesson, canMarkAttendance, accentColor, onClose, onSaved }: Props) {
  const t = useTranslations('education.journal')
  const { lang } = useLang()

  const [students, setStudents] = useState<StudentEntry[]>([])
  const [statuses, setStatuses] = useState<Map<string, AttendanceStatus | null>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Разовые гости урока (студенты вне группы).
  const [showGuest, setShowGuest] = useState(false)
  const [guestQuery, setGuestQuery] = useState('')
  const [guestResults, setGuestResults] = useState<GuestResult[]>([])
  const [guestBusy, setGuestBusy] = useState(false)

  const STATUS_LABEL: Record<AttendanceStatus, string> = {
    present: t('status_present'),
    late: t('status_late'),
    absent: t('status_absent'),
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/education/lessons/${lesson.id}/attendance`)
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error ?? t('att_load_error'))
      }
      const data = await resp.json()
      const list: StudentEntry[] = data.students ?? []
      setStudents(list)
      setStatuses(new Map(list.map(s => [s.journey_id, s.status])))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('att_load_error'))
    } finally {
      setLoading(false)
    }
  }, [lesson.id, t])

  useEffect(() => { load() }, [load])

  const setStudentStatus = (journeyId: string, status: AttendanceStatus) => {
    if (!canMarkAttendance) return
    setBanner(null)
    setStatuses(prev => {
      const next = new Map(prev)
      // Повторный клик по выбранному статусу снимает локальный выбор
      next.set(journeyId, prev.get(journeyId) === status ? null : status)
      return next
    })
  }

  const markAllPresent = () => {
    if (!canMarkAttendance) return
    setBanner(null)
    setStatuses(new Map(students.map(s => [s.journey_id, 'present' as AttendanceStatus])))
  }

  const markedCount = Array.from(statuses.values()).filter(Boolean).length

  const handleSave = async () => {
    const entries = students
      .map(s => ({ journey_id: s.journey_id, status: statuses.get(s.journey_id) ?? null }))
      .filter((e): e is { journey_id: string; status: AttendanceStatus } => e.status !== null)
    if (entries.length === 0) return
    setSaving(true)
    setBanner(null)
    try {
      const resp = await fetch(`/api/education/lessons/${lesson.id}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setBanner({ kind: 'err', text: err.error ?? t('att_save_failed') })
        return
      }
      setBanner({ kind: 'ok', text: t('att_saved') })
      onSaved()
    } catch {
      setBanner({ kind: 'err', text: t('att_save_failed') })
    } finally {
      setSaving(false)
    }
  }

  const searchGuests = async () => {
    const q = guestQuery.trim()
    if (q.length < 2) { setGuestResults([]); return }
    setGuestBusy(true)
    try {
      const resp = await fetch(`/api/education/students?search=${encodeURIComponent(q)}`)
      if (!resp.ok) { setGuestResults([]); return }
      const data = await resp.json()
      const enrolledSet = new Set(students.map(s => s.journey_id))
      const results: GuestResult[] = (data.journeys ?? [])
        .map((j: { id: string; person?: { full_name?: string | null; hebrew_name?: string | null } }) => ({
          id: j.id, name: j.person?.hebrew_name || j.person?.full_name || '—',
        }))
        .filter((r: GuestResult) => !enrolledSet.has(r.id))
        .slice(0, 8)
      setGuestResults(results)
    } finally { setGuestBusy(false) }
  }

  const addGuest = async (journeyId: string) => {
    setGuestBusy(true); setBanner(null)
    try {
      const resp = await fetch(`/api/education/lessons/${lesson.id}/roster`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journey_id: journeyId }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setBanner({ kind: 'err', text: err.error ?? t('att_save_failed') })
        return
      }
      setGuestQuery(''); setGuestResults([]); setShowGuest(false)
      await load()
    } finally { setGuestBusy(false) }
  }

  const removeGuest = async (journeyId: string) => {
    setGuestBusy(true); setBanner(null)
    try {
      const resp = await fetch(`/api/education/lessons/${lesson.id}/roster?journey_id=${journeyId}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setBanner({ kind: 'err', text: err.error ?? t('att_save_failed') })
        return
      }
      await load()
    } finally { setGuestBusy(false) }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: 640,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        {/* Заголовок */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {t('att_title')} · {formatDate(lang, lesson.scheduled_date)}
              {lesson.scheduled_time && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {lesson.scheduled_time.slice(0, 5)}</span>}
            </h2>
            {lesson.topic && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{lesson.topic}</div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {!canMarkAttendance && (
          <div style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '6px 10px', marginTop: 8 }}>
            {t('att_readonly_hint')}
          </div>
        )}

        {/* Быстрые действия */}
        {canMarkAttendance && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {students.length > 0 && (
              <button
                onClick={markAllPresent}
                style={{
                  padding: '4px 10px', fontSize: 12,
                  color: STATUS_COLORS.present.color, background: STATUS_COLORS.present.bg,
                  border: `1px solid ${STATUS_COLORS.present.border}`, borderRadius: 6, cursor: 'pointer',
                }}
              >
                {t('att_mark_all_present')}
              </button>
            )}
            <button
              onClick={() => { setShowGuest(v => !v); setGuestQuery(''); setGuestResults([]) }}
              style={{ padding: '4px 10px', fontSize: 12, color: 'var(--accent-strong)', background: 'var(--accent-tint)', border: '1px solid var(--accent)', borderRadius: 6, cursor: 'pointer' }}
            >
              + {t('att_guest_add')}
            </button>
          </div>
        )}

        {/* Добавление разового гостя */}
        {canMarkAttendance && showGuest && (
          <div style={{ marginTop: 10, padding: 10, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface-2)' }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>{t('att_guest_hint')}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={guestQuery}
                onChange={e => setGuestQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchGuests() } }}
                placeholder={t('att_guest_search_ph')}
                style={{ flex: 1, padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }}
              />
              <button onClick={searchGuests} disabled={guestBusy || guestQuery.trim().length < 2}
                style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-muted)', opacity: (guestBusy || guestQuery.trim().length < 2) ? 0.55 : 1 }}>
                {t('att_guest_search')}
              </button>
            </div>
            {guestResults.length > 0 && (
              <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                {guestResults.map(r => (
                  <button key={r.id} onClick={() => addGuest(r.id)} disabled={guestBusy}
                    style={{ textAlign: 'start', padding: '7px 10px', fontSize: 13, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                    + {r.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Список студентов */}
        <div style={{ flex: 1, overflowY: 'auto', marginTop: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('att_loading')}</div>
          ) : error ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#DC2626', fontSize: 13 }}>{error}</div>
          ) : students.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('att_empty')}</div>
          ) : (
            students.map((s, i) => {
              const current = statuses.get(s.journey_id) ?? null
              return (
                <div
                  key={s.journey_id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '9px 12px', flexWrap: 'wrap',
                    borderTop: i > 0 ? '1px solid var(--surface-2)' : 'none',
                  }}
                >
                  <div style={{ minWidth: 140 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {s.hebrew_name || s.full_name || '—'}
                      {s.is_guest && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-strong)', background: 'var(--accent-tint)', border: '1px solid var(--accent)', borderRadius: 99, padding: '1px 7px' }}>
                          {t('att_guest')}
                        </span>
                      )}
                      {s.is_guest && canMarkAttendance && (
                        <button onClick={() => removeGuest(s.journey_id)} disabled={guestBusy} title={t('att_guest_remove')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
                      )}
                    </div>
                    {!current && (
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('att_not_marked')}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {STATUS_ORDER.map(status => {
                      const active = current === status
                      const c = STATUS_COLORS[status]
                      return (
                        <button
                          key={status}
                          onClick={() => setStudentStatus(s.journey_id, status)}
                          disabled={!canMarkAttendance}
                          style={{
                            padding: '3px 10px', fontSize: 12, borderRadius: 99, fontWeight: active ? 600 : 400,
                            color: active ? c.color : 'var(--text-muted)',
                            background: active ? c.bg : 'var(--surface)',
                            border: `1px solid ${active ? c.border : 'var(--border-strong)'}`,
                            cursor: canMarkAttendance ? 'pointer' : 'default',
                          }}
                        >
                          {STATUS_LABEL[status]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Баннер результата */}
        {banner && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13,
            background: banner.kind === 'ok' ? '#D1FAE5' : '#FEE2E2',
            color: banner.kind === 'ok' ? '#065F46' : '#991B1B',
          }}>
            {banner.text}
          </div>
        )}

        {/* Заметки к уроку (журнал) */}
        <LessonNotes lessonId={lesson.id} accentColor={accentColor} />

        {/* Футер */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('att_marked_of').replace('{marked}', String(markedCount)).replace('{total}', String(students.length))}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}
            >
              {t('att_close')}
            </button>
            {canMarkAttendance && (
              <button
                onClick={handleSave}
                disabled={saving || markedCount === 0}
                style={{
                  padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff',
                  background: accentColor, border: 'none', borderRadius: 8,
                  cursor: (saving || markedCount === 0) ? 'not-allowed' : 'pointer',
                  opacity: (saving || markedCount === 0) ? 0.55 : 1,
                }}
              >
                {saving ? t('att_saving') : t('att_save')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
