'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'
import { toast } from '@/components/ui/toast'
import SubmissionLink from './SubmissionLink'
import type { CourseResultStatus } from '@/types/database'
import type { SubmissionState } from '@/lib/education/courses'

interface CourseAssessment {
  id: string
  title: string
  description: string | null
  date: string | null
  max_score: number
  score: number | null
  requires_submission: boolean
  submission: { id: string; file_name: string; submitted_at: string } | null
  submission_state: SubmissionState | null
}

interface Course {
  class_group_id: string
  name: string
  subject: string | null
  period_start: string | null
  period_end: string | null
  status: CourseResultStatus
  final_grade: number | null
  note: string | null
  average_percent: number | null
  assessments: CourseAssessment[]
}

const STATUS_COLOR: Record<CourseResultStatus, { bg: string; fg: string }> = {
  in_progress: { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
  passed: { bg: 'var(--success-tint)', fg: 'var(--success)' },
  failed: { bg: 'var(--danger-tint)', fg: 'var(--danger)' },
  incomplete: { bg: 'var(--warn-tint)', fg: 'var(--warn)' },
  withdrawn: { bg: 'var(--surface-2)', fg: 'var(--text-faint)' },
}

const STATE_COLOR: Record<SubmissionState, string> = {
  submitted: 'var(--success)',
  late: 'var(--warn)',
  missing: 'var(--danger)',
  open: 'var(--info)',
}

/**
 * Курсы ученицы: מצב בקורס (статус, ציון סופי, средний балл) и все работы
 * курса с оценками; у מטלות להגשה — состояние сдачи.
 *
 *   mode='staff'   — карточка ученицы: видит файлы сдач, ссылка на группу.
 *   mode='student' — портал: может сдать/заменить файл, пока работа не оценена.
 *   mode='preview' — «как видит ученица» для сотрудника: без загрузки.
 */
export default function StudentCoursesPanel({ journeyId, mode }: { journeyId: string; mode: 'staff' | 'student' | 'preview' }) {
  const t = useTranslations('education.courses')
  const { lang } = useLang()
  const [courses, setCourses] = useState<Course[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/education/journeys/${journeyId}/courses`)
      const b = r.ok ? await r.json() : null
      setCourses(b?.courses ?? [])
    } finally {
      setLoaded(true)
    }
  }, [journeyId])

  useEffect(() => { load() }, [load])

  // В портале пустой блок не показываем (как и остальные панели ученицы).
  if (!loaded) return null
  if (courses.length === 0 && mode !== 'staff') return null

  const toggle = (id: string) => setOpen(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>{t('title')}</h3>
      {courses.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('empty')}</div>
      ) : (
        // minmax(0, 1fr): без этого колонка grid растягивается до полной ширины
        // длинного названия курса (nowrap), и строка курса вылезала за рамку
        // карточки на телефоне (заметка владельца 2026-11-10: «משהו בורח שם»).
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
          {courses.map(c => {
            const sc = STATUS_COLOR[c.status]
            const isOpen = open.has(c.class_group_id)
            const pending = c.assessments.filter(a => a.submission_state === 'open' || a.submission_state === 'missing').length
            return (
              <div key={c.class_group_id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-2)' }}>
                <button
                  type="button"
                  onClick={() => toggle(c.class_group_id)}
                  aria-expanded={isOpen}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'start', color: 'var(--text)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Название переносится, а не режется многоточием: на телефоне
                        «…ь 1 (университет)» не читалось. */}
                    <div style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: 'break-word' }}>
                      {c.subject ?? c.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>
                      {c.subject ? c.name : ''}
                      {c.period_start && <> {c.subject ? '· ' : ''}{formatDate(c.period_start, lang)}{c.period_end ? ` – ${formatDate(c.period_end, lang)}` : ''}</>}
                    </div>
                  </div>
                  {pending > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--info)', whiteSpace: 'nowrap' }}>
                      {t('pending_assignments').replace('{n}', String(pending))}
                    </span>
                  )}
                  <span style={{ padding: '2px 9px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.fg, whiteSpace: 'nowrap' }}>
                    {t(`status.${c.status}`)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', minWidth: 36, textAlign: 'end' }}>
                    {c.final_grade != null ? c.final_grade : c.average_percent != null ? <span style={{ color: 'var(--text-muted)', fontWeight: 600 }} title={t('average_hint')}>~{c.average_percent}</span> : '—'}
                  </span>
                  <span aria-hidden style={{ color: 'var(--text-faint)', fontSize: 12 }}>{isOpen ? '▴' : '▾'}</span>
                </button>

                {isOpen && (
                  <div style={{ padding: '0 12px 12px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>{t('final_grade')}: <b style={{ color: 'var(--text)' }}>{c.final_grade ?? '—'}</b></span>
                      <span>{t('average')}: <b style={{ color: 'var(--text)' }}>{c.average_percent ?? '—'}</b></span>
                      {mode === 'staff' && (
                        <Link href={`/dashboard/education/class-groups/${c.class_group_id}`} style={{ color: 'var(--accent-strong, var(--accent))' }}>
                          {t('open_group')}
                        </Link>
                      )}
                    </div>
                    {mode === 'staff' && c.note && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{c.note}</div>
                    )}
                    {c.assessments.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('no_assessments')}</div>
                    ) : c.assessments.map(a => (
                      <AssessmentRow key={a.id} a={a} mode={mode} lang={lang} onSubmitted={load} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AssessmentRow({ a, mode, lang, onSubmitted }: {
  a: CourseAssessment
  mode: 'staff' | 'student' | 'preview'
  lang: string
  onSubmitted: () => void
}) {
  const t = useTranslations('education.courses')
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const canUpload = mode === 'student' && a.requires_submission && a.score === null

  async function upload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch(`/api/portal/assignments/${a.id}/submission`, { method: 'POST', body: fd })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) {
        toast(b.error ?? t('upload_failed'), 'error')
        return
      }
      toast(t('upload_ok'), 'success')
      onSubmitted()
    } catch {
      toast(t('upload_failed'), 'error')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.requires_submission ? '📝 ' : ''}{a.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
            {a.date ? `${a.requires_submission ? t('due') : t('date')} ${formatDate(a.date, lang)}` : ''}
            {a.submission_state && (
              <span style={{ color: STATE_COLOR[a.submission_state], fontWeight: 600 }}>
                {a.date ? ' · ' : ''}{t(`submission.${a.submission_state}`)}
              </span>
            )}
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', color: 'var(--text)' }}>
          {a.score === null ? '—' : a.score}
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)' }}> / {a.max_score}</span>
        </div>
      </div>
      {a.description && a.requires_submission && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{a.description}</div>
      )}
      {(a.submission || canUpload) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          {a.submission && (mode === 'staff' || mode === 'student'
            ? <SubmissionLink submissionId={a.submission.id} fileName={a.submission.file_name} />
            : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>📎 {a.submission.file_name}</span>)}
          {canUpload && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid var(--accent-strong, var(--accent))', background: 'var(--surface)',
                  color: 'var(--accent-strong, var(--accent))', opacity: uploading ? 0.6 : 1,
                }}
              >
                {uploading ? t('uploading') : a.submission ? t('replace_file') : t('upload_file')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
