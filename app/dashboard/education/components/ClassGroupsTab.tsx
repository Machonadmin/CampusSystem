'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import ClassGroupModal from './ClassGroupModal'

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

const MONTH_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  const fmt = (d: string) => {
    const dt = new Date(d + 'T00:00:00')
    return `${MONTH_SHORT[dt.getMonth()]} ${dt.getFullYear()}`
  }
  if (start && end) return `${fmt(start)} — ${fmt(end)}`
  if (start) return `с ${fmt(start)}`
  return `до ${fmt(end!)}`
}

export default function ClassGroupsTab() {
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
      if (!gResp.ok) throw new Error(`Ошибка загрузки групп: ${gResp.status}`)
      if (!dResp.ok) throw new Error(`Ошибка загрузки подразделений: ${dResp.status}`)
      const gJson = await gResp.json()
      const dJson = await dResp.json()
      const sJson = sResp.ok ? await sResp.json() : { subjects: [] }
      setGroups(gJson.class_groups ?? [])
      setDepartments(Array.isArray(dJson) ? dJson : (dJson.departments ?? []))
      setSubjects(sJson.subjects ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }, [showInactive, filterDept, filterSubject])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { setFilterSubject('') }, [filterDept])

  const handleDelete = async (group: ClassGroup) => {
    if (!confirm(`Удалить учебную группу «${group.name}»?`)) return
    try {
      const resp = await fetch(`/api/education/class-groups/${group.id}`, { method: 'DELETE' })
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

  const filteredSubjects = filterDept
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
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={inp}>
          <option value="">Все подразделения</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select
          value={filterSubject}
          onChange={e => setFilterSubject(e.target.value)}
          disabled={filteredSubjects.length === 0}
          style={{ ...inp, opacity: filteredSubjects.length === 0 ? 0.5 : 1 }}
        >
          <option value="">Все предметы</option>
          {filteredSubjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Показать неактивные
        </label>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setEditingGroup(null); setModalMode('create') }} style={btnPrimary}>
          + Учебная группа
        </button>
      </div>

      {loading && <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Загрузка…</div>}

      {error && (
        <div style={{ padding: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        groups.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
            {filterDept || filterSubject ? 'Ничего не найдено' : 'Учебных групп пока нет'}
          </div>
        ) : (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={thStyle}>Название</th>
                  <th style={thStyle}>Предмет</th>
                  <th style={thStyle}>Подразделение</th>
                  <th style={{ ...thStyle, width: 100 }}>Уровень</th>
                  <th style={{ ...thStyle, width: 180 }}>Период</th>
                  <th style={thStyle}>Преподаватели</th>
                  <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>Студентов</th>
                  <th style={{ ...thStyle, width: 90 }}>Статус</th>
                  <th style={{ ...thStyle, width: 190 }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => {
                  const primary = g.teachers.find(t => t.is_primary)
                  const extraCount = g.teachers.length - (primary ? 1 : 0)
                  return (
                    <tr
                      key={g.id}
                      style={{ borderTop: '1px solid #F3F4F6' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#FAFAFA' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{g.name}</td>
                      <td style={{ ...tdStyle, color: '#374151' }}>{g.subject?.name ?? '—'}</td>
                      <td style={{ ...tdStyle, color: '#6B7280' }}>{g.department?.name ?? '—'}</td>
                      <td style={{ ...tdStyle, color: '#6B7280' }}>
                        {g.level ?? <span style={{ color: '#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, color: '#6B7280', whiteSpace: 'nowrap' }}>
                        {formatPeriod(g.period_start, g.period_end)}
                      </td>
                      <td style={tdStyle}>
                        {g.teachers.length === 0 ? (
                          <span style={{ color: '#D1D5DB' }}>—</span>
                        ) : (
                          <span>
                            {primary?.full_name
                              ? <strong>{primary.full_name}</strong>
                              : <span style={{ color: '#6B7280' }}>Не назначен</span>}
                            {extraCount > 0 && (
                              <span style={{ color: '#9CA3AF', marginLeft: 4 }}>+{extraCount}</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{
                          fontSize: 12, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
                          background: g.counts.students > 0 ? '#EEF2FF' : '#F3F4F6',
                          color: g.counts.students > 0 ? '#3730A3' : '#9CA3AF',
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
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button
                            onClick={() => alert('Карточка группы будет реализована')}
                            style={{ ...btnSecondary, color: accent, borderColor: accent }}
                          >
                            Карточка
                          </button>
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
  padding: '10px 12px', fontWeight: 600, color: '#374151',
  textAlign: 'left', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: '#1F2937' }
