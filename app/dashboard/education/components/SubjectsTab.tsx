'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import SubjectModal from './SubjectModal'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Department {
  id: string
  name: string
}

interface Subject {
  id: string
  name: string
  name_he: string | null
  sort_order: number
  is_active: boolean
  department_id: string
  department: Department | null
  created_at: string
  updated_at: string
}

const accent = getModuleColor('education')

export default function SubjectsTab() {
  const t = useTranslations('education.study')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterDept, setFilterDept] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sResp, dResp] = await Promise.all([
        fetch(`/api/education/subjects?active_only=${showInactive ? 'false' : 'true'}`),
        fetch('/api/settings/departments'),
      ])
      if (!sResp.ok) throw new Error(t('subjects.load_error').replace('{status}', String(sResp.status)))
      if (!dResp.ok) throw new Error(t('common.error_generic'))
      const sJson = await sResp.json()
      const dJson = await dResp.json()
      setSubjects(sJson.subjects ?? [])
      setDepartments(Array.isArray(dJson) ? dJson : (dJson.departments ?? []))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_unknown'))
    } finally {
      setLoading(false)
    }
  }, [showInactive, t])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = async (subj: Subject) => {
    if (!confirm(t('subjects.confirm_delete').replace('{name}', subj.name))) return
    try {
      const resp = await fetch(`/api/education/subjects/${subj.id}`, { method: 'DELETE' })
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
    setEditingSubject(null)
    loadData()
  }

  const filtered = filterDept
    ? subjects.filter(s => s.department_id === filterDept)
    : subjects

  const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none' }
  const btnSecondary: React.CSSProperties = {
    padding: '5px 10px', fontSize: 12, color: '#374151',
    background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div>
      {/* Тулбар */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={filterDept}
          onChange={e => setFilterDept(e.target.value)}
          style={inp}
        >
          <option value="">{t('common.all_departments')}</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
          />
          {t('common.show_inactive')}
        </label>

        <div style={{ flex: 1 }} />

        <PageActionButton
          label={t('subjects.add_button')}
          onClick={() => { setEditingSubject(null); setModalMode('create') }}
          accentColor={accent}
        />
      </div>

      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>{t('common.loading')}</div>
      )}

      {error && (
        <div style={{ padding: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
            {subjects.length === 0 ? t('subjects.empty_none') : t('common.nothing_found')}
          </div>
        ) : (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={thStyle}>{t('subjects.table_name')}</th>
                  <th style={thStyle}>{t('subjects.table_department')}</th>
                  <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>{t('subjects.table_sort_order')}</th>
                  <th style={{ ...thStyle, width: 100 }}>{t('subjects.table_status')}</th>
                  <th style={{ ...thStyle, width: 160 }}>{t('subjects.table_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr
                    key={s.id}
                    style={{ borderTop: '1px solid #F3F4F6' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#FAFAFA' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                  >
                    <td style={tdStyle}>{s.name}</td>
                    <td style={{ ...tdStyle, color: '#6B7280' }}>{s.department?.name ?? '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: '#9CA3AF' }}>{s.sort_order}</td>
                    <td style={tdStyle}>
                      {s.is_active ? (
                        <span style={{ color: '#10B981', fontWeight: 500 }}>{t('subjects.status_active')}</span>
                      ) : (
                        <span style={{ color: '#9CA3AF' }}>{t('subjects.status_inactive')}</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => { setEditingSubject(s); setModalMode('edit') }}
                          style={btnSecondary}
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          style={{ ...btnSecondary, color: '#DC2626', borderColor: '#FCA5A5' }}
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {modalMode && (
        <SubjectModal
          mode={modalMode}
          initial={editingSubject}
          departments={departments}
          onClose={() => { setModalMode(null); setEditingSubject(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontWeight: 600, color: '#374151',
  textAlign: 'start', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: '#1F2937' }
