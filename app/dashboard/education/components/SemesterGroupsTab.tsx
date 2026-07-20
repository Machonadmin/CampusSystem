'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import SemesterGroupModal from './SemesterGroupModal'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { toast } from '@/components/ui/toast'

interface Department { id: string; name: string; name_he?: string | null; name_en?: string | null }
interface StudyTrackRef { id: string; name_he: string | null; name_ru: string | null; name_en: string | null }

interface SemesterGroup {
  id: string
  name: string
  year_label: string | null
  term_number: number | null
  sem_status: string | null
  tuition_amount: number | null
  study_track: StudyTrackRef | null
  department: { id: string; name: string; name_he?: string | null; name_en?: string | null } | null
  counts: { teachers: number; students: number }
}

interface SemesterGroupInitial {
  id: string
  name: string
  year_label: string | null
  term_number: number | null
  study_track_id: string | null
  department_id: string
  tuition_amount: number | null
  period_start: string | null
  period_end: string | null
  teachers: { person_id: string; full_name: string | null; is_primary: boolean; monthly_rate: number | null }[]
  students: { journey_id: string; full_name: string | null }[]
}

const accent = getModuleColor('education')

function trackName(tr: StudyTrackRef | null, lang: string): string {
  if (!tr) return '—'
  if (lang === 'ru') return (tr.name_ru && tr.name_ru.trim()) || tr.name_he || tr.name_en || '—'
  if (lang === 'en') return (tr.name_en && tr.name_en.trim()) || tr.name_he || tr.name_ru || '—'
  return (tr.name_he && tr.name_he.trim()) || tr.name_ru || tr.name_en || '—'
}

export default function SemesterGroupsTab() {
  const t = useTranslations('education.study')
  const { lang } = useLang()
  const [groups, setGroups] = useState<SemesterGroup[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingInitial, setEditingInitial] = useState<SemesterGroupInitial | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [gResp, dResp] = await Promise.all([
        fetch('/api/education/semester-groups'),
        fetch('/api/settings/departments'),
      ])
      if (!gResp.ok) throw new Error(t('common.error_generic'))
      const gJson = await gResp.json()
      const dJson = dResp.ok ? await dResp.json() : []
      setGroups(gJson.semester_groups ?? [])
      setDepartments(Array.isArray(dJson) ? dJson : (dJson.departments ?? []))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_unknown'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadData() }, [loadData])

  const openCreate = () => { setEditingInitial(null); setModalMode('create') }

  const openEdit = async (id: string) => {
    try {
      const resp = await fetch(`/api/education/semester-groups/${id}`)
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        toast(err.error ?? t('common.error_generic'), 'error')
        return
      }
      const detail = await resp.json()
      setEditingInitial({
        id: detail.id,
        name: detail.name,
        year_label: detail.year_label ?? null,
        term_number: detail.term_number ?? null,
        study_track_id: detail.study_track_id ?? null,
        department_id: detail.department_id,
        tuition_amount: detail.tuition_amount ?? null,
        period_start: detail.period_start ?? null,
        period_end: detail.period_end ?? null,
        teachers: detail.teachers ?? [],
        students: detail.students ?? [],
      })
      setModalMode('edit')
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error_generic'), 'error')
    }
  }

  const handleSaved = () => {
    setModalMode(null)
    setEditingInitial(null)
    loadData()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }} />
        <PageActionButton
          label={t('semester_groups.add_button')}
          onClick={openCreate}
          accentColor={accent}
        />
      </div>

      {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('common.loading')}</div>}

      {error && (
        <div style={{ padding: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        groups.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
            {t('semester_groups.empty_none')}
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={thStyle}>{t('semester_groups.table_name')}</th>
                  <th style={thStyle}>{t('semester_groups.table_track')}</th>
                  <th style={thStyle}>{t('semester_groups.table_department')}</th>
                  <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>{t('semester_groups.table_teachers')}</th>
                  <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>{t('semester_groups.table_students')}</th>
                  <th style={{ ...thStyle, width: 120 }}>{t('semester_groups.table_tuition')}</th>
                  <th style={{ ...thStyle, width: 110 }}>{t('semester_groups.table_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <tr
                    key={g.id}
                    style={{ borderTop: '1px solid var(--surface-2)', cursor: 'pointer' }}
                    onClick={() => openEdit(g.id)}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                      {g.name}
                      {(g.year_label || g.term_number != null) && (
                        <span style={{ color: 'var(--text-faint)', marginLeft: 6, fontSize: 12 }}>
                          {[g.year_label, g.term_number != null ? `#${g.term_number}` : null].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text)' }}>{trackName(g.study_track, lang)}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                      {g.department ? localizedDeptName(g.department, lang) : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>{g.counts.teachers}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{
                        fontSize: 12, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
                        background: g.counts.students > 0 ? 'var(--accent-tint)' : 'var(--surface-2)',
                        color: g.counts.students > 0 ? '#3730A3' : 'var(--text-faint)',
                      }}>
                        {g.counts.students}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {g.tuition_amount != null ? `₪ ${g.tuition_amount}` : '—'}
                    </td>
                    <td style={tdStyle} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => openEdit(g.id)}
                        style={{
                          padding: '5px 10px', fontSize: 12, color: 'var(--text)',
                          background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
                        }}
                      >
                        {t('common.edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {modalMode && (
        <SemesterGroupModal
          mode={modalMode}
          initial={editingInitial}
          departments={departments}
          onClose={() => { setModalMode(null); setEditingInitial(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontWeight: 600, color: 'var(--text)',
  textAlign: 'start', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: 'var(--text)' }
