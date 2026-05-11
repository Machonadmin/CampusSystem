'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import SubjectModal from './SubjectModal'

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
      if (!sResp.ok) throw new Error(`Ошибка загрузки предметов: ${sResp.status}`)
      if (!dResp.ok) throw new Error(`Ошибка загрузки подразделений: ${dResp.status}`)
      const sJson = await sResp.json()
      const dJson = await dResp.json()
      setSubjects(sJson.subjects ?? [])
      setDepartments(Array.isArray(dJson) ? dJson : (dJson.departments ?? []))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }, [showInactive])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = async (subj: Subject) => {
    if (!confirm(`Удалить предмет "${subj.name}"?`)) return
    try {
      const resp = await fetch(`/api/education/subjects/${subj.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? 'Не удалось удалить')
        return
      }
      loadData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка удаления')
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
  const btnPrimary: React.CSSProperties = {
    padding: '7px 14px', fontSize: 13, fontWeight: 500, color: '#fff',
    background: accent, border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
  }
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
          <option value="">Все подразделения</option>
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
          Показать неактивные
        </label>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => { setEditingSubject(null); setModalMode('create') }}
          style={btnPrimary}
        >
          + Предмет
        </button>
      </div>

      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Загрузка…</div>
      )}

      {error && (
        <div style={{ padding: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
            {subjects.length === 0 ? 'Предметов пока нет' : 'Ничего не найдено'}
          </div>
        ) : (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={thStyle}>Название</th>
                  <th style={thStyle}>На иврите</th>
                  <th style={thStyle}>Подразделение</th>
                  <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>Порядок</th>
                  <th style={{ ...thStyle, width: 100 }}>Статус</th>
                  <th style={{ ...thStyle, width: 160 }}>Действия</th>
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
                    <td style={{ ...tdStyle, color: '#6B7280', direction: 'rtl', textAlign: 'right' }}>{s.name_he ?? '—'}</td>
                    <td style={{ ...tdStyle, color: '#6B7280' }}>{s.department?.name ?? '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: '#9CA3AF' }}>{s.sort_order}</td>
                    <td style={tdStyle}>
                      {s.is_active ? (
                        <span style={{ color: '#10B981', fontWeight: 500 }}>Активен</span>
                      ) : (
                        <span style={{ color: '#9CA3AF' }}>Неактивен</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => { setEditingSubject(s); setModalMode('edit') }}
                          style={btnSecondary}
                        >
                          Изменить
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          style={{ ...btnSecondary, color: '#DC2626', borderColor: '#FCA5A5' }}
                        >
                          Удалить
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
  textAlign: 'left', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: '#1F2937' }
