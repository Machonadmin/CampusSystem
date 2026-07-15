'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { downloadCsv } from '@/lib/csv'

interface Assessment { id: string; title: string; max_score: number; assessment_date: string | null; graded_count: number; average: number | null }
interface Student { journey_id: string; name: string; scores: Record<string, number | null>; average: number | null }
interface Gradebook { class_group_id: string; assessments: Assessment[]; students: Student[] }

function pctColor(p: number | null): string {
  if (p === null) return 'var(--text-faint)'
  if (p >= 85) return 'var(--success)'
  if (p >= 70) return 'var(--warn)'
  return 'var(--danger)'
}
const shortDate = (d: string | null) => (d ? d.slice(5).replace('-', '/') : '')

export default function GradebookModal({ group, onClose }: { group: { id: string; name: string }; onClose: () => void }) {
  const t = useTranslations('education.reports')
  const [data, setData] = useState<Gradebook | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/education/class-groups/${group.id}/gradebook`)
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (alive) setData(b) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [group.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function exportCsv() {
    if (!data) return
    const header: Array<string | number | null> = [t('gb_student'), ...data.assessments.map(a => a.title), t('gb_average')]
    const rows: Array<Array<string | number | null>> = [header]
    for (const st of data.students) {
      rows.push([st.name || '', ...data.assessments.map(a => st.scores[a.id] ?? ''), st.average])
    }
    // строка максимумов для контекста
    rows.push([t('gb_max_score'), ...data.assessments.map(a => a.max_score), ''])
    downloadCsv(`${group.name}-${t('gb_title')}.csv`, rows)
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg)', border: '1px solid var(--border-strong)', borderRadius: 14, width: 'min(1000px, 100%)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        {/* Заголовок */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('gb_title')} · {group.name}</div>
            {data && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{data.students.length} · {data.assessments.length} {t('gb_assessments')}</div>}
          </div>
          <button onClick={exportCsv} disabled={!data || data.assessments.length === 0}
            style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-muted)' }}>
            ⭳ {t('export_csv')}
          </button>
          <button onClick={onClose}
            style={{ padding: '6px 10px', fontSize: 15, lineHeight: 1, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-muted)' }}>✕</button>
        </div>

        {/* Тело */}
        <div style={{ maxHeight: '72vh', overflow: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>…</div>
          ) : !data || data.assessments.length === 0 ? (
            <div style={{ padding: 44, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('gb_empty')}</div>
          ) : (
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', insetInlineStart: 0, background: 'var(--surface-2)', textAlign: 'start', padding: '9px 12px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', zIndex: 1 }}>{t('gb_student')}</th>
                  {data.assessments.map(a => (
                    <th key={a.id} style={{ textAlign: 'center', padding: '9px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', minWidth: 64 }}>
                      <div>{a.title}</div>
                      <div style={{ fontWeight: 400, color: 'var(--text-faint)', marginTop: 1 }}>{shortDate(a.assessment_date)} · /{a.max_score}</div>
                    </th>
                  ))}
                  <th style={{ textAlign: 'center', padding: '9px 12px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{t('gb_average')}</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map(st => (
                  <tr key={st.journey_id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ position: 'sticky', insetInlineStart: 0, background: 'var(--surface)', textAlign: 'start', padding: '8px 12px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', zIndex: 1 }}>{st.name || '—'}</td>
                    {data.assessments.map(a => {
                      const s = st.scores[a.id]
                      return (
                        <td key={a.id} style={{ textAlign: 'center', padding: '8px 10px', fontFamily: 'var(--font-mono)', color: s === null || s === undefined ? 'var(--text-faint)' : 'var(--text)' }}>
                          {s === null || s === undefined ? '·' : s}
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'center', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: pctColor(st.average) }}>
                      {st.average === null ? '—' : `${st.average}%`}
                    </td>
                  </tr>
                ))}
                {/* Средние по заданию */}
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td style={{ position: 'sticky', insetInlineStart: 0, background: 'var(--surface-2)', textAlign: 'start', padding: '8px 12px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', zIndex: 1 }}>{t('gb_avg_row')}</td>
                  {data.assessments.map(a => (
                    <td key={a.id} style={{ textAlign: 'center', padding: '8px 10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: pctColor(a.average) }}>
                      {a.average === null ? '—' : `${a.average}%`}
                    </td>
                  ))}
                  <td style={{ padding: '8px 12px' }} />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
