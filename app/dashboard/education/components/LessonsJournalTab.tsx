'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import AttendancePanel from './AttendancePanel'

// ── Типы ──────────────────────────────────────────────────────────────────────

export interface LessonItem {
  id: string
  class_group_id: string
  scheduled_date: string          // 'YYYY-MM-DD'
  scheduled_time: string | null   // 'HH:MM:SS'
  topic: string | null
  description: string | null
  location: string | null
  is_cancelled: boolean
  marked_count: number
}

interface Props {
  groupId: string
  canManageLessons: boolean
  canMarkAttendance: boolean
  accentColor: string
}

// ── Хелперы ───────────────────────────────────────────────────────────────────

function formatDate(lang: string, iso: string): string {
  const locale = lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-US' : 'ru-RU'
  return new Date(iso + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(time: string | null): string {
  return time ? time.slice(0, 5) : '—'
}

// ── Компонент ─────────────────────────────────────────────────────────────────

export default function LessonsJournalTab({ groupId, canManageLessons, canMarkAttendance, accentColor }: Props) {
  const t = useTranslations('education.journal')
  const { lang } = useLang()

  const [lessons, setLessons] = useState<LessonItem[]>([])
  const [enrolledCount, setEnrolledCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formLesson, setFormLesson] = useState<LessonItem | 'create' | null>(null)
  const [attendanceLesson, setAttendanceLesson] = useState<LessonItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/education/class-groups/${groupId}/lessons`)
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error ?? t('load_error'))
      }
      const data = await resp.json()
      setLessons(data.lessons ?? [])
      setEnrolledCount(data.enrolled_count ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [groupId, t])

  useEffect(() => { load() }, [load])

  const handleToggleCancel = async (lesson: LessonItem) => {
    try {
      const resp = await fetch(`/api/education/lessons/${lesson.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_cancelled: !lesson.is_cancelled }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? t('action_failed'))
        return
      }
      load()
    } catch {
      alert(t('action_failed'))
    }
  }

  const handleDelete = async (lesson: LessonItem) => {
    if (!confirm(t('delete_confirm'))) return
    try {
      const resp = await fetch(`/api/education/lessons/${lesson.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? t('action_failed'))
        return
      }
      load()
    } catch {
      alert(t('action_failed'))
    }
  }

  const btnSmall: React.CSSProperties = {
    padding: '4px 10px', fontSize: 12, color: '#374151',
    background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer',
  }
  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px',
    borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    fontSize: 13, color: '#1F2937', padding: '10px 12px', borderBottom: '1px solid #F3F4F6',
  }

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', padding: 20 }}>
      {/* Заголовок секции */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1F2937', margin: 0 }}>
          {t('section_title')}
          <span style={{ fontWeight: 400, color: '#6B7280', marginLeft: 6, fontSize: 13 }}>
            ({lessons.length})
          </span>
        </h2>
        {canManageLessons && (
          <button
            onClick={() => setFormLesson('create')}
            style={{
              padding: '4px 10px', fontSize: 12, color: accentColor,
              background: '#fff', border: `1px solid ${accentColor}`, borderRadius: 6, cursor: 'pointer',
            }}
          >
            {t('add_lesson')}
          </button>
        )}
      </div>

      {/* Тело */}
      {loading ? (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: '8px 0' }}>{t('loading')}</div>
      ) : error ? (
        <div style={{ color: '#DC2626', fontSize: 13, padding: '8px 0' }}>{error}</div>
      ) : lessons.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: '8px 0' }}>{t('empty')}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('col_date')}</th>
                <th style={th}>{t('col_time')}</th>
                <th style={th}>{t('col_topic')}</th>
                <th style={th}>{t('col_location')}</th>
                <th style={th}>{t('col_attendance')}</th>
                <th style={th}>{t('col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map(lesson => (
                <tr key={lesson.id} style={{ opacity: lesson.is_cancelled ? 0.55 : 1 }}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDate(lang, lesson.scheduled_date)}</td>
                  <td style={td}>{formatTime(lesson.scheduled_time)}</td>
                  <td style={td}>
                    <span>{lesson.topic || '—'}</span>
                    {lesson.is_cancelled && (
                      <span style={{
                        marginLeft: 8, fontSize: 11, padding: '2px 7px', borderRadius: 99,
                        fontWeight: 500, background: '#F3F4F6', color: '#6B7280',
                      }}>
                        {t('cancelled_badge')}
                      </span>
                    )}
                  </td>
                  <td style={td}>{lesson.location || '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <span style={{
                      color: lesson.marked_count > 0 ? '#059669' : '#9CA3AF',
                      fontWeight: lesson.marked_count > 0 ? 600 : 400,
                    }}>
                      {lesson.marked_count} / {enrolledCount}
                    </span>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setAttendanceLesson(lesson)}
                        style={{ ...btnSmall, color: accentColor, borderColor: accentColor }}
                      >
                        {t('action_attendance')}
                      </button>
                      {canManageLessons && (
                        <>
                          <button onClick={() => setFormLesson(lesson)} style={btnSmall}>
                            {t('action_edit')}
                          </button>
                          <button onClick={() => handleToggleCancel(lesson)} style={btnSmall}>
                            {lesson.is_cancelled ? t('action_restore') : t('action_cancel')}
                          </button>
                          <button
                            onClick={() => handleDelete(lesson)}
                            style={{ ...btnSmall, color: '#DC2626', borderColor: '#FCA5A5' }}
                          >
                            {t('action_delete')}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Модал формы урока */}
      {formLesson !== null && (
        <LessonFormModal
          groupId={groupId}
          lesson={formLesson === 'create' ? null : formLesson}
          accentColor={accentColor}
          onClose={() => setFormLesson(null)}
          onDone={() => { setFormLesson(null); load() }}
        />
      )}

      {/* Панель посещаемости */}
      {attendanceLesson && (
        <AttendancePanel
          lesson={attendanceLesson}
          canMarkAttendance={canMarkAttendance}
          accentColor={accentColor}
          onClose={() => setAttendanceLesson(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

// ── Модал создания/редактирования урока ───────────────────────────────────────

interface LessonFormModalProps {
  groupId: string
  lesson: LessonItem | null   // null = создание
  accentColor: string
  onClose: () => void
  onDone: () => void
}

function LessonFormModal({ groupId, lesson, accentColor, onClose, onDone }: LessonFormModalProps) {
  const t = useTranslations('education.journal')

  const [date, setDate] = useState(lesson?.scheduled_date ?? '')
  const [time, setTime] = useState(lesson?.scheduled_time ? lesson.scheduled_time.slice(0, 5) : '')
  const [topic, setTopic] = useState(lesson?.topic ?? '')
  const [location, setLocation] = useState(lesson?.location ?? '')
  const [description, setDescription] = useState(lesson?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!date.trim()) {
      setFormError(t('date_required'))
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        scheduled_date: date,
        scheduled_time: time.trim() || null,
        topic: topic.trim() || null,
        description: description.trim() || null,
        location: location.trim() || null,
      }
      const resp = lesson
        ? await fetch(`/api/education/lessons/${lesson.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/education/class-groups/${groupId}/lessons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setFormError(err.error ?? t('action_failed'))
        return
      }
      onDone()
    } catch {
      setFormError(t('action_failed'))
    } finally {
      setSaving(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13,
    border: '1px solid #D1D5DB', borderRadius: 8,
    boxSizing: 'border-box', outline: 'none',
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
          background: '#fff', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: 440,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1F2937', margin: 0 }}>
            {lesson ? t('modal_edit_title') : t('modal_create_title')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>{t('date_label')} *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>{t('time_label')}</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>{t('topic_label')}</label>
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder={t('topic_placeholder')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('location_label')}</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder={t('location_placeholder')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('description_label')}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>

        {formError && (
          <div style={{
            marginTop: 12, padding: '8px 12px', background: '#FEE2E2', color: '#991B1B',
            borderRadius: 8, fontSize: 13,
          }}>
            {formError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
          <button
            onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', fontSize: 13, color: '#374151', background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, cursor: 'pointer' }}
          >
            {t('btn_cancel')}
          </button>
          <button
            onClick={handleSubmit} disabled={saving}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff',
              background: accentColor, border: 'none', borderRadius: 8,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.55 : 1,
            }}
          >
            {saving ? t('btn_saving') : t('btn_save')}
          </button>
        </div>
      </div>
    </div>
  )
}
