'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import StudyGroupModal from './StudyGroupModal'

interface Department { id: string; name: string }
interface Specialty { id: string; name: string; code: string | null; department_id: string }

interface StudyGroup {
  id: string
  name: string
  year_level: number | null
  year_start: number | null
  notes: string | null
  is_active: boolean
  department_id: string
  specialty_id: string | null
  department: { id: string; name: string } | null
  specialty: { id: string; name: string; code: string | null } | null
  counts: { students: number }
}

const accent = getModuleColor('education')

export default function StudyGroupsTab() {
  const [groups, setGroups] = useState<StudyGroup[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterDept, setFilterDept] = useState('')
  const [filterSpec, setFilterSpec] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingGroup, setEditingGroup] = useState<StudyGroup | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [gResp, dResp, sResp] = await Promise.all([
        fetch(`/api/education/study-groups?active_only=${showInactive ? 'false' : 'true'}`),
        fetch('/api/settings/departments'),
        fetch('/api/education/specialties?active_only=false'),
      ])
      if (!gResp.ok) throw new Error(`Ошибка загрузки групп: ${gResp.status}`)
      if (!dResp.ok) throw new Error(`Ошибка загрузки подразделений: ${dResp.status}`)
      const gJson = await gResp.json()
      const dJson = await dResp.json()
      const sJson = sResp.ok ? await sResp.json() : { specialties: [] }
      setGroups(gJson.study_groups ?? [])
      setDepartments(Array.isArray(dJson) ? dJson : (dJson.departments ?? []))
      setSpecialties(sJson.specialties ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }, [showInactive])

  useEffect(() => { loadData() }, [loadData])

  // Сбрасываем фильтр по специальности при смене подразделения
  useEffect(() => {
    setFilterSpec('')
  }, [filterDept])

  const handleDelete = async (group: StudyGroup) => {
    if (!confirm(`Удалить базовую группу «${group.name}»?`)) return
    try {
      const resp = await fetch(`/api/education/study-groups/${group.id}`, { method: 'DELETE' })
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
    setEditingGroup(null)
    loadData()
  }

  // Специальности для фильтра — только из выбранного подразделения
  const filteredSpecOptions = filterDept
    ? specialties.filter(s => s.department_id === filterDept)
    : specialties

  // Фильтрация таблицы на клиенте
  const filtered = groups.filter(g => {
    if (filterDept && g.department_id !== filterDept) return false
    if (filterSpec && g.specialty_id !== filterSpec) return false
    return true
  })

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
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={inp}>
          <option value="">Все подразделения</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <select
          value={filterSpec}
          onChange={e => setFilterSpec(e.target.value)}
          disabled={filteredSpecOptions.length === 0}
          style={{ ...inp, color: filterSpec ? '#1F2937' : '#9CA3AF', opacity: filteredSpecOptions.length === 0 ? 0.5 : 1 }}
        >
          <option value="">Все специальности</option>
          {filteredSpecOptions.map(s => (
            <option key={s.id} value={s.id}>
              {s.code ? `[${s.code}] ${s.name}` : s.name}
            </option>
          ))}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Показать неактивные
        </label>

        <div style={{ flex: 1 }} />

        <button onClick={() => { setEditingGroup(null); setModalMode('create') }} style={btnPrimary}>
          + Группа
        </button>
      </div>

      {loading && <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Загрузка…</div>}

      {error && (
        <div style={{ padding: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
            {groups.length === 0 ? 'Базовых групп пока нет' : 'Ничего не найдено'}
          </div>
        ) : (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={thStyle}>Название</th>
                  <th style={thStyle}>Подразделение</th>
                  <th style={thStyle}>Специальность</th>
                  <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>Курс</th>
                  <th style={{ ...thStyle, width: 90, textAlign: 'center' }}>Год набора</th>
                  <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>Студентов</th>
                  <th style={{ ...thStyle, width: 100 }}>Статус</th>
                  <th style={{ ...thStyle, width: 160 }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(g => (
                  <tr
                    key={g.id}
                    style={{ borderTop: '1px solid #F3F4F6' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#FAFAFA' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{g.name}</td>
                    <td style={{ ...tdStyle, color: '#6B7280' }}>{g.department?.name ?? '—'}</td>
                    <td style={{ ...tdStyle, color: '#6B7280' }}>
                      {g.specialty
                        ? (g.specialty.code ? `[${g.specialty.code}] ${g.specialty.name}` : g.specialty.name)
                        : <span style={{ color: '#D1D5DB' }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: '#6B7280' }}>
                      {g.year_level ?? <span style={{ color: '#D1D5DB' }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: '#6B7280' }}>
                      {g.year_start ?? <span style={{ color: '#D1D5DB' }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <span style={{
                        fontSize: 12, padding: '2px 8px', borderRadius: 99,
                        background: g.counts.students > 0 ? '#EEF2FF' : '#F3F4F6',
                        color: g.counts.students > 0 ? '#3730A3' : '#9CA3AF',
                        fontWeight: 500,
                      }}>
                        {g.counts.students}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {g.is_active
                        ? <span style={{ color: '#10B981', fontWeight: 500 }}>Активна</span>
                        : <span style={{ color: '#9CA3AF' }}>Неактивна</span>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditingGroup(g); setModalMode('edit') }} style={btnSecondary}>
                          Изменить
                        </button>
                        <button
                          onClick={() => handleDelete(g)}
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
        <StudyGroupModal
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
  padding: '10px 12px', fontWeight: 600, color: '#374151',
  textAlign: 'left', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: '#1F2937' }
