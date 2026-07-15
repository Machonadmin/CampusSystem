'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getModuleColor } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import ClassGroupModal from './ClassGroupModal'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'

interface Department { id: string; name: string }
interface Subject { id: string; name: string; department_id: string }

interface Teacher {
  person_id: string
  full_name: string | null
  is_primary: boolean
}

interface ClassGroup {
  id: string
  name: string
  level: string | null
  period_start: string | null
  period_end: string | null
  notes: string | null
  is_active: boolean
  department_id: string
  subject_id: string
  subject: { id: string; name: string; name_he: string | null } | null
  department: { id: string; name: string } | null
  counts: { students: number }
  teachers: Teacher[]
}

const accent = getModuleColor('education')

function formatPeriod(lang: string, start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  const locale = lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-US' : 'ru-RU'
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(locale, { month: 'short', year: 'numeric' })
  if (start && end) return `${fmt(start)} — ${fmt(end)}`
  if (start) return `${fmt(start)} →`
  return `→ ${fmt(end!)}`
}

export default function ClassGroupsTab() {
  const router = useRouter()
  const t = useTranslations('education.study')
  const { lang } = useLang()
  const [groups, setGroups] = useState<ClassGroup[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterDept, setFilterDept] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingGroup, setEditingGroup] = useState<ClassGroup | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (!showInactive) params.set('active_only', 'true')
      else params.set('active_only', 'false')
      if (filterDept) params.set('department_id', filterDept)
      if (filterSubject) params.set('subject_id', filterSubject)

      const [gResp, dResp, sResp] = await Promise.all([
        fetch(`/api/education/class-groups?${params}`),
        fetch('/api/settings/departments'),
        fetch('/api/education/subjects?active_only=false'),
      ])
      if (!gResp.ok) throw new Error(t('class_groups.load_error').replace('{status}', String(gResp.status)))
      if (!dResp.ok) throw new Error(t('common.error_generic'))
      const gJson = await gResp.json()
      const dJson = await dResp.json()
      const sJson = sResp.ok ? await sResp.json() : { subjects: [] }
      setGroups(gJson.class_groups ?? [])
      setDepartments(Array.isArray(dJson) ? dJson : (dJson.departments ?? []))
      setSubjects(sJson.subjects ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_unknown'))
    } finally {
      setLoading(false)
    }
  }, [showInactive, filterDept, filterSubject, t])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { setFilterSubject('') }, [filterDept])

  const handleDelete = async (group: ClassGroup) => {
    if (!confirm(t('class_groups.confirm_delete').replace('{name}', group.name))) return
    try {
      const resp = await fetch(`/api/education/class-groups/${group.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? t('common.error_delete_failed'))
        return
      }
      loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : t('common.error_delete_generic'))
    }
  }

  const handleSaved = () => {
    setModalMode(null)
    setEditingGroup(null)
    loadData()
  }

  const filteredSubjects = filterDept
    ? subjects.filter(s => s.department_id === filterDept)
    : subjects

  const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none' }
  const btnSecondary: React.CSSProperties = {
    padding: '5px 10px', fontSize: 12, color: 'var(--text)',
    background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div>
      {/* Тулбар */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={inp}>
          <option value="">{t('common.all_departments')}</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select
          value={filterSubject}
          onChange={e => setFilterSubject(e.target.value)}
          disabled={filteredSubjects.length === 0}
          style={{ ...inp, opacity: filteredSubjects.length === 0 ? 0.5 : 1 }}
        >
          <option value="">{t('class_groups.all_subjects')}</option>
          {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          {t('common.show_inactive')}
        </label>
        <div style={{ flex: 1 }} />
        <PageActionButton
          label={t('class_groups.add_button')}
          onClick={() => { setEditingGroup(null); setModalMode('create') }}
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
            {filterDept || filterSubject ? t('common.nothing_found') : t('class_groups.empty_none')}
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={thStyle}>{t('class_groups.table_name')}</th>
                  <th style={thStyle}>{t('class_groups.table_subject')}</th>
                  <th style={thStyle}>{t('class_groups.table_department')}</th>
                  <th style={{ ...thStyle, width: 100 }}>{t('class_groups.table_level')}</th>
                  <th style={{ ...thStyle, width: 180 }}>{t('class_groups.table_period')}</th>
                  <th style={thStyle}>{t('class_groups.table_teachers')}</th>
                  <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>{t('class_groups.table_students')}</th>
                  <th style={{ ...thStyle, width: 90 }}>{t('class_groups.table_status')}</th>
                  <th style={{ ...thStyle, width: 190 }}>{t('class_groups.table_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => {
                  const primary = g.teachers.find(tc => tc.is_primary)
                  const extraCount = g.teachers.length - (primary ? 1 : 0)
                  return (
                    <tr
                      key={g.id}
                      style={{ borderTop: '1px solid var(--surface-2)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{g.name}</td>
                      <td style={{ ...tdStyle, color: 'var(--text)' }}>{g.subject?.name ?? '—'}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{g.department?.name ?? '—'}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                        {g.level ?? <span style={{ color: 'var(--border-strong)' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatPeriod(lang, g.period_start, g.period_end)}
                      </td>
                      <td style={tdStyle}>
                        {g.teachers.length === 0 ? (
                          <span style={{ color: 'var(--border-strong)' }}>—</span>
                        ) : (
                          <span>
                            {primary?.full_name
                              ? <strong>{primary.full_name}</strong>
                              : <span style={{ color: 'var(--text-muted)' }}>{t('class_groups.no_teacher_assigned')}</span>}
                            {extraCount > 0 && (
                              <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>+{extraCount}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{
                          fontSize: 12, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
                          background: g.counts.students > 0 ? 'var(--accent-tint)' : 'var(--surface-2)',
                          color: g.counts.students > 0 ? '#3730A3' : 'var(--text-faint)',
                        }}>
                          {g.counts.students}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {g.is_active
                          ? <span style={{ color: '#10B981', fontWeight: 500 }}>{t('class_groups.status_active')}</span>
                          : <span style={{ color: 'var(--text-faint)' }}>{t('class_groups.status_inactive')}</span>}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button
                            onClick={() => router.push(`/dashboard/education/class-groups/${g.id}`)}
                            style={{ ...btnSecondary, color: accent, borderColor: accent }}
                          >
                            {t('class_groups.card_button')}
                          </button>
                          <button onClick={() => { setEditingGroup(g); setModalMode('edit') }} style={btnSecondary}>
                            {t('common.edit')}
                          </button>
                          <button
                            onClick={() => handleDelete(g)}
                            style={{ ...btnSecondary, color: '#DC2626', borderColor: '#FCA5A5' }}
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {modalMode && (
        <ClassGroupModal
          mode={modalMode}
          initial={editingGroup}
          departments={departments}
          onClose={() => { setModalMode(null); setEditingGroup(null) }}
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
