'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'

// ── Типы (форма ответа GET /api/education/journeys/[id]/report) ────────────────

interface AttendanceBlock {
  present: number
  late: number
  absent: number
  marked: number
  total_lessons: number
  percent: number | null
}

interface AssessmentDetail {
  assessment_id: string
  title: string
  max_score: number
  assessment_date: string | null
  score: number | null
}

interface GroupReport {
  class_group_id: string
  name: string
  level: string | null
  subject: { id: string; name: string; name_he: string | null } | null
  department: { id: string; name: string } | null
  attendance: AttendanceBlock
  grades: {
    graded_count: number
    total_assessments: number
    average: number | null
    assessments: AssessmentDetail[]
  }
}

interface ReportData {
  journey_id: string
  summary: {
    visible_group_count: number
    attendance: AttendanceBlock
    grades: { graded_count: number; total_assessments: number; average: number | null }
  }
  groups: GroupReport[]
}

interface Props {
  journeyId: string
  accentColor?: string
}

// ── Хелперы отображения ─────────────────────────────────────────────────────────

const ACCENT = '#10B981'

function pct(v: number | null): string {
  return v === null ? '—' : `${v}%`
}

/** Цвет для процентного показателя (посещаемость / средний балл). */
function scoreColor(v: number | null): string {
  if (v === null) return 'var(--text-faint)'
  if (v >= 90) return '#059669'
  if (v >= 75) return '#D97706'
  return '#DC2626'
}

function subjectName(subject: GroupReport['subject'], lang: string): string {
  if (!subject) return ''
  if (lang === 'he' && subject.name_he) return subject.name_he
  return subject.name
}

function formatDate(lang: string, iso: string | null): string {
  if (!iso) return ''
  const locale = lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-US' : 'ru-RU'
  return new Date(iso + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatNum(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return String(v)
}

/** Подстановка {placeholder} значений — как в остальных i18n-строках проекта. */
function fill(tpl: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), tpl)
}

// ── Компонент ─────────────────────────────────────────────────────────────────

export default function StudentReportTab({ journeyId, accentColor = ACCENT }: Props) {
  const t = useTranslations('education.report')
  const { lang } = useLang()

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/education/journeys/${journeyId}/report`)
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error ?? t('load_error'))
      }
      setData(await resp.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [journeyId, t])

  useEffect(() => { load() }, [load])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Стили ─────────────────────────────────────────────────────────────────
  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
    padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = {
    fontSize: 13, color: 'var(--text)', padding: '10px 10px', borderBottom: '1px solid var(--surface-2)', verticalAlign: 'top',
  }

  if (loading) {
    return <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '8px 0' }}>{t('loading')}</div>
  }
  if (error) {
    return <div style={{ color: '#DC2626', fontSize: 13, padding: '8px 0' }}>{error}</div>
  }
  if (!data || data.groups.length === 0) {
    return <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '8px 0' }}>{t('empty')}</div>
  }

  const s = data.summary

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Сводка ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <SummaryTile
          label={t('overall_attendance')}
          value={pct(s.attendance.percent)}
          valueColor={scoreColor(s.attendance.percent)}
          caption={fill(t('coverage'), { done: s.attendance.marked, total: s.attendance.total_lessons })}
          accentColor={accentColor}
        />
        <SummaryTile
          label={t('overall_grade')}
          value={pct(s.grades.average)}
          valueColor={scoreColor(s.grades.average)}
          caption={fill(t('coverage'), { done: s.grades.graded_count, total: s.grades.total_assessments })}
          accentColor={accentColor}
        />
      </div>

      {/* ── Таблица по группам ──────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
          <thead>
            <tr>
              <th style={th}>{t('col_group')}</th>
              <th style={{ ...th, textAlign: 'center' }}>{t('col_attendance')}</th>
              <th style={{ ...th, textAlign: 'center' }}>{t('col_grades')}</th>
              <th style={{ ...th, width: 28 }} aria-hidden />
            </tr>
          </thead>
          <tbody>
            {data.groups.map(g => {
              const isOpen = expanded.has(g.class_group_id)
              const subj = subjectName(g.subject, lang)
              return (
                <FragmentRow
                  key={g.class_group_id}
                  group={g}
                  isOpen={isOpen}
                  subj={subj}
                  lang={lang}
                  accentColor={accentColor}
                  td={td}
                  onToggle={() => toggle(g.class_group_id)}
                  t={t}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Сводная плитка ──────────────────────────────────────────────────────────────

function SummaryTile({
  label, value, valueColor, caption, accentColor,
}: { label: string; value: string; valueColor: string; caption: string; accentColor: string }) {
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '14px 16px', borderTop: `3px solid ${accentColor}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: valueColor, marginTop: 4, lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{caption}</div>
    </div>
  )
}

// ── Строка группы + раскрывающаяся деталь ────────────────────────────────────────

function FragmentRow({
  group, isOpen, subj, lang, accentColor, td, onToggle, t,
}: {
  group: GroupReport
  isOpen: boolean
  subj: string
  lang: string
  accentColor: string
  td: React.CSSProperties
  onToggle: () => void
  t: (key: string) => string
}) {
  const a = group.attendance
  const gr = group.grades

  const pillWrap: React.CSSProperties = { display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginTop: 5 }

  return (
    <>
      <tr
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
      >
        {/* Группа */}
        <td style={td}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{subj || group.name}</div>
          {subj && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 1 }}>{group.name}</div>}
        </td>

        {/* Посещаемость: % + покрытие + разбивка */}
        <td style={{ ...td, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: scoreColor(a.percent) }}>{pct(a.percent)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            {fill(t('coverage'), { done: a.marked, total: a.total_lessons })}
          </div>
          <div style={pillWrap}>
            <Pill n={a.present} color="var(--success)" bg="var(--success-tint)" title={t('status_present')} />
            <Pill n={a.late} color="var(--warn)" bg="var(--warn-tint)" title={t('status_late')} />
            <Pill n={a.absent} color="var(--danger)" bg="var(--danger-tint)" title={t('status_absent')} />
          </div>
        </td>

        {/* Оценки: средний % + покрытие */}
        <td style={{ ...td, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: scoreColor(gr.average) }}>{pct(gr.average)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            {fill(t('coverage'), { done: gr.graded_count, total: gr.total_assessments })}
          </div>
        </td>

        {/* Шеврон */}
        <td style={{ ...td, textAlign: 'center', color: accentColor, fontSize: 12 }}>
          <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
        </td>
      </tr>

      {/* Деталь по заданиям */}
      {isOpen && (
        <tr>
          <td colSpan={4} style={{ padding: 0, borderBottom: '1px solid var(--surface-2)', background: 'var(--surface-2)' }}>
            <div style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                {t('assessments_title')}
              </div>
              {gr.assessments.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('no_assessments')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {gr.assessments.map(as => {
                    const graded = as.score !== null
                    return (
                      <div key={as.assessment_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                        <div style={{ color: 'var(--text)', minWidth: 0 }}>
                          <span style={{ fontWeight: 500 }}>{as.title}</span>
                          {as.assessment_date && (
                            <span style={{ color: 'var(--text-faint)', marginInlineStart: 6, fontSize: 12 }}>
                              {formatDate(lang, as.assessment_date)}
                            </span>
                          )}
                        </div>
                        <div style={{ whiteSpace: 'nowrap', fontWeight: 600, color: graded ? 'var(--text)' : 'var(--border-strong)' }}>
                          {graded ? `${formatNum(as.score)} / ${formatNum(as.max_score)}` : '—'}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Мини-бейдж счётчика статуса ──────────────────────────────────────────────────

function Pill({ n, color, bg, title }: { n: number; color: string; bg: string; title: string }) {
  const dim = n === 0
  return (
    <span
      title={title}
      style={{
        fontSize: 11, fontWeight: 600, lineHeight: 1,
        padding: '3px 6px', borderRadius: 6,
        color: dim ? 'var(--text-faint)' : color,
        background: dim ? 'var(--surface-2)' : bg,
        minWidth: 18, textAlign: 'center',
      }}
    >
      {n}
    </span>
  )
}
