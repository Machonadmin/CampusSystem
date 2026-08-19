'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import type { AssessmentItem } from './GradesTab'

// ── Типы ──────────────────────────────────────────────────────────────────────

interface StudentEntry {
  journey_id: string
  full_name: string | null
  hebrew_name: string | null
  score: number | null
  comment: string | null
  graded_by: string | null
  graded_at: string | null
}

interface Props {
  assessment: AssessmentItem
  canSetGrades: boolean
  accentColor: string
  onClose: () => void
  onSaved: () => void
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

export default function GradeEntryPanel({ assessment, canSetGrades, accentColor, onClose, onSaved }: Props) {
  const t = useTranslations('education.grades')
  const { lang } = useLang()

  const [students, setStudents] = useState<StudentEntry[]>([])
  const [maxScore, setMaxScore] = useState<number>(Number(assessment.max_score))
  const [scores, setScores] = useState<Map<string, string>>(new Map())
  const [comments, setComments] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/education/assessments/${assessment.id}/grades`)
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error ?? t('entry_load_error'))
      }
      const data = await resp.json()
      const list: StudentEntry[] = data.students ?? []
      setStudents(list)
      if (data.max_score !== null && data.max_score !== undefined) setMaxScore(Number(data.max_score))
      setScores(new Map(list.map(s => [
        s.journey_id,
        s.score !== null && s.score !== undefined ? String(Number(s.score)) : '',
      ])))
      setComments(new Map(list.map(s => [s.journey_id, s.comment ?? ''])))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('entry_load_error'))
    } finally {
      setLoading(false)
    }
  }, [assessment.id, t])

  useEffect(() => { load() }, [load])

  const setScore = (journeyId: string, val: string) => {
    if (!canSetGrades) return
    setBanner(null)
    setScores(prev => {
      const next = new Map(prev)
      next.set(journeyId, val)
      return next
    })
  }

  const setComment = (journeyId: string, val: string) => {
    if (!canSetGrades) return
    setComments(prev => {
      const next = new Map(prev)
      next.set(journeyId, val)
      return next
    })
  }

  const gradedCount = Array.from(scores.values()).filter(v => v.trim() !== '').length

  const handleSave = async () => {
    const entries: { journey_id: string; score: number; comment: string | null }[] = []
    for (const s of students) {
      const raw = (scores.get(s.journey_id) ?? '').trim()
      if (raw === '') continue
      const n = Number(raw)
      if (!Number.isFinite(n) || n < 0 || n > maxScore) {
        setBanner({ kind: 'err', text: t('score_out_of_range').replace('{max}', formatScore(maxScore)) })
        return
      }
      const c = (comments.get(s.journey_id) ?? '').trim()
      entries.push({ journey_id: s.journey_id, score: n, comment: c || null })
    }
    if (entries.length === 0) return

    setSaving(true)
    setBanner(null)
    try {
      const resp = await fetch(`/api/education/assessments/${assessment.id}/grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setBanner({ kind: 'err', text: err.error ?? t('save_failed') })
        return
      }
      setBanner({ kind: 'ok', text: t('saved') })
      onSaved()
    } catch {
      setBanner({ kind: 'err', text: t('save_failed') })
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '5px 8px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 6,
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
          width: '100%', maxWidth: 680,
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        {/* Заголовок */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
              {assessment.title}
            </h2>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('entry_title')} · {t('of_max').replace('{max}', formatScore(maxScore))}
              {assessment.assessment_date && <span> · {formatDate(lang, assessment.assessment_date)}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {!canSetGrades && (
          <div style={{ fontSize: 12, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '6px 10px', marginTop: 8 }}>
            {t('readonly_hint')}
          </div>
        )}

        {/* Список студентов */}
        <div style={{ flex: 1, overflowY: 'auto', marginTop: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('entry_loading')}</div>
          ) : error ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#DC2626', fontSize: 13 }}>{error}</div>
          ) : students.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('entry_empty')}</div>
          ) : (
            students.map((s, i) => (
              <div
                key={s.journey_id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '9px 12px', flexWrap: 'wrap',
                  borderTop: i > 0 ? '1px solid var(--surface-2)' : 'none',
                }}
              >
                <div style={{ minWidth: 140, flex: '1 1 140px' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                    {s.full_name ?? s.hebrew_name ?? '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      min={0}
                      max={maxScore}
                      step="0.01"
                      value={scores.get(s.journey_id) ?? ''}
                      onChange={e => setScore(s.journey_id, e.target.value)}
                      disabled={!canSetGrades}
                      aria-label={t('score_label')}
                      style={{ ...inputStyle, width: 70, textAlign: 'center', background: canSetGrades ? 'var(--surface)' : 'var(--surface-2)' }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>/ {formatScore(maxScore)}</span>
                  </div>
                  <input
                    value={comments.get(s.journey_id) ?? ''}
                    onChange={e => setComment(s.journey_id, e.target.value)}
                    disabled={!canSetGrades}
                    placeholder={t('comment_placeholder')}
                    style={{ ...inputStyle, width: 180, background: canSetGrades ? 'var(--surface)' : 'var(--surface-2)' }}
                  />
                </div>
              </div>
            ))
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

        {/* Футер */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('graded_of').replace('{graded}', String(gradedCount)).replace('{total}', String(students.length))}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}
            >
              {t('close')}
            </button>
            {canSetGrades && (
              <button
                onClick={handleSave}
                disabled={saving || gradedCount === 0}
                style={{
                  padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff',
                  background: accentColor, border: 'none', borderRadius: 8,
                  cursor: (saving || gradedCount === 0) ? 'not-allowed' : 'pointer',
                  opacity: (saving || gradedCount === 0) ? 0.55 : 1,
                }}
              >
                {saving ? t('saving') : t('save')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
