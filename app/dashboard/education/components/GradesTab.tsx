'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import GradeEntryPanel from './GradeEntryPanel'
import { toast } from '@/components/ui/toast'
import { RowActionsMenu } from '@/components/ui/RowActionsMenu'

// ── Типы ──────────────────────────────────────────────────────────────────────

export interface AssessmentItem {
  id: string
  class_group_id: string
  title: string
  max_score: number
  assessment_date: string | null   // 'YYYY-MM-DD'
  description: string | null
  graded_count: number
}

interface StudentRow {
  journey_id: string
  full_name: string | null
  hebrew_name: string | null
}

interface Props {
  groupId: string
  canSetGrades: boolean
  accentColor: string
}

// ── Хелперы ───────────────────────────────────────────────────────────────────

function formatScore(v: number | string | null): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : '—'
}

function formatDate(lang: string, iso: string | null): string {
  if (!iso) return ''
  const locale = lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-US' : 'ru-RU'
  return new Date(iso + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Компонент ─────────────────────────────────────────────────────────────────

export default function GradesTab({ groupId, canSetGrades, accentColor }: Props) {
  const t = useTranslations('education.grades')
  const { lang } = useLang()

  const [assessments, setAssessments] = useState<AssessmentItem[]>([])
  const [enrolledCount, setEnrolledCount] = useState(0)
  const [students, setStudents] = useState<StudentRow[]>([])
  // Оценки, ключ `${journey_id}|${assessment_id}` → число
  const [scores, setScores] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formAssessment, setFormAssessment] = useState<AssessmentItem | 'create' | null>(null)
  const [entryAssessment, setEntryAssessment] = useState<AssessmentItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/education/class-groups/${groupId}/assessments`)
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error ?? t('load_error'))
      }
      const data = await resp.json()
      const list: AssessmentItem[] = data.assessments ?? []
      setAssessments(list)
      setEnrolledCount(data.enrolled_count ?? 0)

      // Оценки по каждому заданию → заполняем матрицу (ростер + значения)
      if (list.length > 0) {
        const results = await Promise.all(
          list.map(a =>
            fetch(`/api/education/assessments/${a.id}/grades`).then(r => (r.ok ? r.json() : null))
          )
        )
        const studentMap = new Map<string, StudentRow>()
        const scoreMap = new Map<string, number>()
        results.forEach((res, idx) => {
          if (!res) return
          const a = list[idx]
          for (const s of res.students ?? []) {
            if (!studentMap.has(s.journey_id)) {
              studentMap.set(s.journey_id, {
                journey_id: s.journey_id,
                full_name: s.full_name ?? null,
                hebrew_name: s.hebrew_name ?? null,
              })
            }
            if (s.score !== null && s.score !== undefined) {
              scoreMap.set(`${s.journey_id}|${a.id}`, Number(s.score))
            }
          }
        })
        const roster = Array.from(studentMap.values()).sort((x, y) =>
          (x.full_name ?? x.hebrew_name ?? '').localeCompare(y.full_name ?? y.hebrew_name ?? '')
        )
        setStudents(roster)
        setScores(scoreMap)
      } else {
        setStudents([])
        setScores(new Map())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [groupId, t])

  useEffect(() => { load() }, [load])

  const handleDelete = async (a: AssessmentItem) => {
    if (!confirm(t('delete_confirm'))) return
    try {
      const resp = await fetch(`/api/education/assessments/${a.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        toast(err.error ?? t('action_failed'), 'error')
        return
      }
      load()
    } catch {
      toast(t('action_failed'), 'error')
    }
  }

  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
    padding: '10px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'top',
  }
  const td: React.CSSProperties = {
    fontSize: 13, color: 'var(--text)', padding: '10px 12px', borderBottom: '1px solid var(--surface-2)',
  }
  const stickyLeft: React.CSSProperties = {
    position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 1,
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 20 }}>
      {/* Заголовок секции */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          {t('section_title')}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 13 }}>
            ({assessments.length})
          </span>
        </h2>
        {canSetGrades && (
          <button
            onClick={() => setFormAssessment('create')}
            style={{
              padding: '4px 10px', fontSize: 12, color: accentColor,
              background: 'var(--surface)', border: `1px solid ${accentColor}`, borderRadius: 6, cursor: 'pointer',
            }}
          >
            {t('add_assessment')}
          </button>
        )}
      </div>

      {/* Тело */}
      {loading ? (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '8px 0' }}>{t('loading')}</div>
      ) : error ? (
        <div style={{ color: '#DC2626', fontSize: 13, padding: '8px 0' }}>{error}</div>
      ) : assessments.length === 0 ? (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '8px 0' }}>{t('empty')}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...th, ...stickyLeft, zIndex: 2, minWidth: 160 }}>{t('col_student')}</th>
                {assessments.map(a => (
                  <th key={a.id} style={{ ...th, minWidth: 96, whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => setEntryAssessment(a)}
                      title={a.description ?? undefined}
                      style={{
                        display: 'block', textAlign: 'start', background: 'none', border: 'none',
                        padding: 0, cursor: 'pointer', color: accentColor, fontWeight: 600, fontSize: 12,
                      }}
                    >
                      {a.title}
                    </button>
                    <div style={{ color: 'var(--text-faint)', fontWeight: 400, marginTop: 2, textTransform: 'none' }}>
                      / {formatScore(a.max_score)}
                      {a.assessment_date && <span> · {formatDate(lang, a.assessment_date)}</span>}
                    </div>
                    <div style={{
                      fontWeight: 400, marginTop: 2, textTransform: 'none',
                      color: a.graded_count > 0 ? '#059669' : 'var(--text-faint)',
                    }}>
                      {a.graded_count} / {enrolledCount}
                    </div>
                    {canSetGrades && (
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                        <RowActionsMenu
                          align="start"
                          actions={[
                            { key: 'edit', label: t('action_edit'), onClick: () => setFormAssessment(a) },
                            { key: 'delete', label: t('action_delete'), onClick: () => handleDelete(a), danger: true },
                          ]}
                        />
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td style={{ ...td, ...stickyLeft }} colSpan={assessments.length + 1}>
                    <span style={{ color: 'var(--text-faint)' }}>{t('entry_empty')}</span>
                  </td>
                </tr>
              ) : (
                students.map(s => (
                  <tr key={s.journey_id}>
                    <td style={{ ...td, ...stickyLeft, fontWeight: 500, whiteSpace: 'nowrap' }}>
                      <Link
                        href={`/dashboard/education/students/${s.journey_id}`}
                        style={{ color: 'var(--text)', textDecoration: 'none' }}
                        onMouseEnter={e => { const el = e.currentTarget; el.style.color = accentColor; el.style.textDecoration = 'underline' }}
                        onMouseLeave={e => { const el = e.currentTarget; el.style.color = 'var(--text)'; el.style.textDecoration = 'none' }}
                      >
                        {s.full_name ?? s.hebrew_name ?? '—'}
                      </Link>
                    </td>
                    {assessments.map(a => {
                      const sc = scores.get(`${s.journey_id}|${a.id}`)
                      const has = sc !== undefined
                      return (
                        <td key={a.id} style={{ ...td, textAlign: 'center' }}>
                          <span style={{ color: has ? 'var(--text)' : 'var(--border-strong)', fontWeight: has ? 600 : 400 }}>
                            {has ? formatScore(sc) : '—'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Модал формы задания */}
      {formAssessment !== null && (
        <AssessmentFormModal
          groupId={groupId}
          assessment={formAssessment === 'create' ? null : formAssessment}
          accentColor={accentColor}
          onClose={() => setFormAssessment(null)}
          onDone={() => { setFormAssessment(null); load() }}
        />
      )}

      {/* Панель выставления оценок */}
      {entryAssessment && (
        <GradeEntryPanel
          assessment={entryAssessment}
          canSetGrades={canSetGrades}
          accentColor={accentColor}
          onClose={() => setEntryAssessment(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

// ── Модал создания/редактирования задания ─────────────────────────────────────

interface AssessmentFormModalProps {
  groupId: string
  assessment: AssessmentItem | null   // null = создание
  accentColor: string
  onClose: () => void
  onDone: () => void
}

function AssessmentFormModal({ groupId, assessment, accentColor, onClose, onDone }: AssessmentFormModalProps) {
  const t = useTranslations('education.grades')

  const [title, setTitle] = useState(assessment?.title ?? '')
  const [maxScore, setMaxScore] = useState(assessment ? String(Number(assessment.max_score)) : '100')
  const [date, setDate] = useState(assessment?.assessment_date ?? '')
  const [description, setDescription] = useState(assessment?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!title.trim()) {
      setFormError(t('title_required'))
      return
    }
    const ms = Number(maxScore)
    if (!Number.isFinite(ms) || ms <= 0) {
      setFormError(t('max_score_invalid'))
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        title: title.trim(),
        max_score: ms,
        assessment_date: date.trim() || null,
        description: description.trim() || null,
      }
      const resp = assessment
        ? await fetch(`/api/education/assessments/${assessment.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/education/class-groups/${groupId}/assessments`, {
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
    display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13,
    border: '1px solid var(--border-strong)', borderRadius: 8,
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
          background: 'var(--surface)', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: 440,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {assessment ? t('modal_edit_title') : t('modal_create_title')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('title_label')} *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('title_placeholder')} style={inputStyle} />
          </div>
          <div className="resp-grid-2" style={{ gap: 12 }}>
            <div>
              <label style={labelStyle}>{t('max_score_label')} *</label>
              <input type="number" min={0} step="0.01" value={maxScore} onChange={e => setMaxScore(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>{t('date_label')}</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>{t('description_label')}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder={t('description_placeholder')}
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

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
          <button
            onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}
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
