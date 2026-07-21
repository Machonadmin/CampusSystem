'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { downloadCsv } from '@/lib/csv'
import GradebookModal from './GradebookModal'

interface Unit { id: string; name: string }
interface AttBlock { present: number; late: number; absent: number; marked: number; total_lessons?: number; percent: number | null }
interface GroupRow {
  class_group_id: string
  name: string
  level: string | null
  subject: { id: string; name: string } | null
  student_count: number
  attendance: AttBlock
  grades: { graded_count: number; total_assessments: number; average: number | null }
}
interface StudentRow {
  journey_id: string
  name: string
  track: string | null
  group_count: number
  attendance: AttBlock
  grade_average: number | null
}
interface Report {
  unit: { id: string; name: string }
  groups: GroupRow[]
  students: StudentRow[]
  summary: {
    group_count: number
    student_count: number
    attendance: AttBlock
    grades: { graded_count: number; total_assessments: number; average: number | null }
  }
}

/** Цвет для процента посещаемости/оценки: ≥85 успех, ≥70 предупреждение, иначе опасность. */
function pctColor(p: number | null): string {
  if (p === null) return 'var(--text-faint)'
  if (p >= 85) return 'var(--success)'
  if (p >= 70) return 'var(--warn)'
  return 'var(--danger)'
}
const pctText = (p: number | null) => (p === null ? '—' : `${p}%`)

export default function ReportsPage() {
  const t = useTranslations('education.reports')
  const tAtt = useTranslations('education.attendance')
  const tNav = useTranslations('navigation')
  const attLabels = { present: tAtt('present'), late: tAtt('late'), absent: tAtt('absent') }

  const [units, setUnits] = useState<Unit[]>([])
  const [unit, setUnit] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'groups' | 'students'>('groups')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [gradebookGroup, setGradebookGroup] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/education/units')
        if (res.ok) {
          const b = await res.json()
          const us: Unit[] = b.units ?? []
          setUnits(us)
          if (us.length > 0) setUnit(us[0].id)
        }
      } finally { setLoadingUnits(false) }
    })()
  }, [])

  const load = useCallback(async (u: string, f: string, tt: string) => {
    if (!u) { setReport(null); return }
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (f) qs.set('from', f)
      if (tt) qs.set('to', tt)
      const q = qs.toString()
      const res = await fetch(`/api/education/units/${u}/report${q ? `?${q}` : ''}`)
      if (res.ok) setReport(await res.json())
      else setReport(null)
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(unit, from, to) }, [unit, from, to, load])

  const s = report?.summary

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '16px 24px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('subtitle')}</p>
      </div>

      {/* Выбор единицы + период */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={unit} onChange={e => setUnit(e.target.value)} disabled={loadingUnits || units.length === 0}
          style={{ padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }}>
          {units.length === 0 && <option value="">{loadingUnits ? '…' : t('no_units')}</option>}
          {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>{t('period')}</span>
          <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} aria-label={t('period_from')}
            style={{ padding: '7px 10px', fontSize: 12.5, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }} />
          <span style={{ color: 'var(--text-faint)' }}>–</span>
          <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} aria-label={t('period_to')}
            style={{ padding: '7px 10px', fontSize: 12.5, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }} />
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo('') }}
              style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
              {t('period_clear')}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>…</div>
      ) : !report ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('no_units')}</div>
      ) : (
        <>
          {/* Сводные карточки */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <StatCard label={t('stat_attendance')} value={pctText(s!.attendance.percent)} color={pctColor(s!.attendance.percent)}
              footer={s!.attendance.marked > 0 ? <AttBreakdown att={s!.attendance} labels={attLabels} variant="summary" /> : undefined} />
            <StatCard label={t('stat_grade_avg')} value={pctText(s!.grades.average)} color={pctColor(s!.grades.average)} />
            <StatCard label={t('stat_students')} value={String(s!.student_count)} />
            <StatCard label={t('stat_groups')} value={String(s!.group_count)} />
          </div>

          {/* Табы + экспорт */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['groups', 'students'] as const).map(key => (
              <button key={key} onClick={() => setTab(key)}
                style={{
                  padding: '7px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${tab === key ? 'var(--accent)' : 'var(--border-strong)'}`,
                  background: tab === key ? 'var(--accent-tint)' : 'var(--surface)',
                  color: tab === key ? 'var(--accent-strong)' : 'var(--text-muted)',
                }}>
                {t(`tab_${key}`)}
              </button>
            ))}
            <button onClick={() => exportSummary(report, tab, t)}
              style={{ marginInlineStart: 'auto', padding: '7px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
              ⭳ {t('export_csv')}
            </button>
          </div>

          {tab === 'groups' ? (
            <ReportTable
              headers={[t('col_group'), t('col_students'), t('col_lessons'), t('col_attendance'), t('col_assessments'), t('col_grade_avg')]}
              empty={t('no_groups')}
              onRowClick={key => {
                const g = report.groups.find(x => x.class_group_id === key)
                if (g) setGradebookGroup({ id: g.class_group_id, name: g.name })
              }}
              rows={report.groups.map(g => ({
                key: g.class_group_id,
                cells: [
                  { text: g.name + (g.subject ? ` · ${g.subject.name}` : ''), strong: true },
                  { text: String(g.student_count) },
                  { text: String(g.attendance.total_lessons ?? 0) },
                  { text: pctText(g.attendance.percent), color: pctColor(g.attendance.percent), strong: true,
                    sub: g.attendance.marked > 0 ? <AttBreakdown att={g.attendance} labels={attLabels} variant="cell" /> : undefined },
                  { text: `${g.grades.graded_count}/${g.grades.total_assessments}` },
                  { text: pctText(g.grades.average), color: pctColor(g.grades.average), strong: true },
                ],
              }))}
            />
          ) : (
            <ReportTable
              headers={[t('col_student'), t('col_track'), t('col_groups'), t('col_marked'), t('col_attendance'), t('col_grade_avg')]}
              empty={t('no_students')}
              rows={report.students.map(st => ({
                key: st.journey_id,
                cells: [
                  { text: st.name || '—', strong: true },
                  { text: st.track || '—' },
                  { text: String(st.group_count) },
                  { text: String(st.attendance.marked) },
                  { text: pctText(st.attendance.percent), color: pctColor(st.attendance.percent), strong: true,
                    sub: st.attendance.marked > 0 ? <AttBreakdown att={st.attendance} labels={attLabels} variant="cell" /> : undefined },
                  { text: pctText(st.grade_average), color: pctColor(st.grade_average), strong: true },
                ],
              }))}
            />
          )}
        </>
      )}

      {gradebookGroup && (
        <GradebookModal group={gradebookGroup} from={from} to={to} onClose={() => setGradebookGroup(null)} />
      )}
    </div>
  )
}

/** Экспорт активной сводной таблицы (группы или студенты) в CSV. */
function exportSummary(report: Report, tab: 'groups' | 'students', t: (k: string, f?: string) => string) {
  const unit = report.unit.name || 'unit'
  if (tab === 'groups') {
    const rows: Array<Array<string | number | null>> = [[
      t('col_group'), t('col_students'), t('col_lessons'), t('col_attendance'), t('col_assessments'), t('col_grade_avg'),
    ]]
    for (const g of report.groups) rows.push([
      g.name + (g.subject ? ` · ${g.subject.name}` : ''),
      g.student_count, g.attendance.total_lessons ?? 0,
      g.attendance.percent, `${g.grades.graded_count}/${g.grades.total_assessments}`, g.grades.average,
    ])
    downloadCsv(`${unit}-${t('tab_groups')}.csv`, rows)
  } else {
    const rows: Array<Array<string | number | null>> = [[
      t('col_student'), t('col_track'), t('col_groups'), t('col_marked'), t('col_attendance'), t('col_grade_avg'),
    ]]
    for (const st of report.students) rows.push([
      st.name || '', st.track || '', st.group_count, st.attendance.marked, st.attendance.percent, st.grade_average,
    ])
    downloadCsv(`${unit}-${t('tab_students')}.csv`, rows)
  }
}

function StatCard({ label, value, color, footer }: { label: string; value: string; color?: string; footer?: ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color ?? 'var(--text)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{value}</div>
      {footer && <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>{footer}</div>}
    </div>
  )
}

/**
 * Разбивка посещаемости присутствовал/опоздал/отсутствовал, цвета консоли.
 * variant='summary' — с текстовыми подписями (для карточки сводки);
 * variant='cell' — компактно «✓N ⏱N ✕N» (для ячеек таблицы).
 */
function AttBreakdown({ att, labels, variant }: {
  att: { present: number; late: number; absent: number }
  labels: { present: string; late: string; absent: string }
  variant: 'summary' | 'cell'
}) {
  const items = [
    { icon: '✓', n: att.present, color: 'var(--success)', label: labels.present },
    { icon: '⏱', n: att.late, color: 'var(--warn)', label: labels.late },
    { icon: '✕', n: att.absent, color: 'var(--danger)', label: labels.absent },
  ]
  if (variant === 'summary') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12 }}>
            <span style={{ color: it.color, fontWeight: 800, fontFamily: 'var(--font-mono)', minWidth: 24, textAlign: 'end' }}>{it.n}</span>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{it.label}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ display: 'inline-flex', gap: 8, marginTop: 3, fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
      {items.map((it, i) => (
        <span key={i} style={{ color: it.color }} title={it.label}>{it.icon}{it.n}</span>
      ))}
    </div>
  )
}

interface Cell { text: string; color?: string; strong?: boolean; sub?: ReactNode }
function ReportTable({ headers, rows, empty, onRowClick }: {
  headers: string[]; rows: { key: string; cells: Cell[] }[]; empty: string
  onRowClick?: (key: string) => void
}) {
  if (rows.length === 0) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{empty}</div>
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ textAlign: i === 0 ? 'start' : 'center', padding: '10px 14px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}
              onClick={onRowClick ? () => onRowClick(r.key) : undefined}
              style={{ borderBottom: '1px solid var(--border)', cursor: onRowClick ? 'pointer' : undefined }}>
              {r.cells.map((c, i) => (
                <td key={i} style={{
                  textAlign: i === 0 ? 'start' : 'center', padding: '9px 14px',
                  color: c.color ?? 'var(--text)', fontWeight: c.strong ? 700 : 400,
                  fontFamily: i === 0 ? undefined : 'var(--font-mono)', whiteSpace: 'nowrap',
                }}>
                  <div>{c.text}</div>
                  {c.sub}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
