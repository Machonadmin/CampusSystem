'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import EducationJourneyForm from '@/components/education/EducationJourneyForm'

interface Department { id: string; name: string }
interface StudyGroup { id: string; name: string; department_id: string }

type StudentStatus = 'active' | 'on_leave' | 'graduated' | 'expelled'

interface Student {
  id: string
  person_id: string
  status: StudentStatus
  primary_department_id: string
  specialty_id: string | null
  main_group_id: string | null
  year_level: number | null
  year_start: number | null
  enrolled_at: string | null
  notes: string | null
  person: {
    id: string
    full_name: string
    hebrew_name: string | null
    email: string | null
    phones: { type: string; number: string }[] | null
    gender: string | null
    birth_date: string | null
  } | null
  main_group: { id: string; name: string; year_level: number | null } | null
  specialty: { id: string; name: string; code: string | null } | null
  department: { id: string; name: string } | null
}

const STATUS_LABEL: Record<StudentStatus, string> = {
  active:    'Активен',
  on_leave:  'Академотпуск',
  graduated: 'Выпускник',
  expelled:  'Отчислен',
}
const STATUS_STYLE: Record<StudentStatus, React.CSSProperties> = {
  active:    { background: '#ECFDF5', color: '#065F46' },
  on_leave:  { background: '#FFFBEB', color: '#92400E' },
  graduated: { background: '#EFF6FF', color: '#1E40AF' },
  expelled:  { background: '#F3F4F6', color: '#6B7280' },
}

const accent = getModuleColor('education')

export default function StudentsTab() {
  const [students, setStudents] = useState<Student[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [studyGroups, setStudyGroups] = useState<StudyGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterStatus, setFilterStatus] = useState('')  // '' = active+on_leave

  const [modalOpen, setModalOpen] = useState(false)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadStudents = useCallback(async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q) params.set('search', q)
      if (filterDept) params.set('department_id', filterDept)
      if (filterGroup) params.set('main_group_id', filterGroup)
      if (filterStatus) params.set('status', filterStatus)

      const resp = await fetch(`/api/education/students?${params}`)
      if (!resp.ok) throw new Error(`Ошибка загрузки студентов: ${resp.status}`)
      const json = await resp.json()
      setStudents(json.students ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }, [filterDept, filterGroup, filterStatus])

  // Загрузка справочников один раз
  useEffect(() => {
    Promise.all([
      fetch('/api/settings/departments').then(r => r.ok ? r.json() : []),
      fetch('/api/education/study-groups?active_only=false').then(r => r.ok ? r.json() : { study_groups: [] }),
    ]).then(([dJson, gJson]) => {
      setDepartments(Array.isArray(dJson) ? dJson : (dJson.departments ?? []))
      setStudyGroups((gJson.study_groups ?? []).map((g: { id: string; name: string; department_id: string }) => ({
        id: g.id, name: g.name, department_id: g.department_id,
      })))
    }).catch(() => {})
  }, [])

  // Debounced перезагрузка при поиске
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadStudents(search), search ? 300 : 0)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search, loadStudents])

  // Сбрасываем фильтр группы при смене подразделения
  useEffect(() => { setFilterGroup('') }, [filterDept])

  const handleExpel = async (student: Student) => {
    const name = student.person?.full_name ?? 'студента'
    if (!confirm(`Отчислить ${name}?\n\nСтатус будет изменён на «Отчислен».`)) return
    try {
      const resp = await fetch(`/api/education/students/${student.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? 'Не удалось отчислить')
        return
      }
      loadStudents(search)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  const handleSaved = () => {
    setModalOpen(false)
    loadStudents(search)
  }

  const filteredGroups = filterDept
    ? studyGroups.filter(g => g.department_id === filterDept)
    : studyGroups

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
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по имени, телефону, email…"
          style={{ ...inp, minWidth: 220, flex: '1 1 220px' }}
        />
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={inp}>
          <option value="">Все подразделения</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select
          value={filterGroup}
          onChange={e => setFilterGroup(e.target.value)}
          disabled={filteredGroups.length === 0}
          style={{ ...inp, opacity: filteredGroups.length === 0 ? 0.5 : 1 }}
        >
          <option value="">Все группы</option>
          {filteredGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inp}>
          <option value="">Активные и в отпуске</option>
          <option value="active">Только активные</option>
          <option value="all">Все статусы</option>
        </select>
        <button onClick={() => setModalOpen(true)} style={btnPrimary}>
          + Студент
        </button>
      </div>

      {loading && <div style={{ padding: 32, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Загрузка…</div>}

      {error && (
        <div style={{ padding: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        students.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
            {search || filterDept || filterGroup || filterStatus ? 'Ничего не найдено' : 'Студентов пока нет'}
          </div>
        ) : (
          <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={thStyle}>ФИО</th>
                  <th style={thStyle}>Контакты</th>
                  <th style={thStyle}>Подразделение</th>
                  <th style={thStyle}>Группа</th>
                  <th style={thStyle}>Специальность</th>
                  <th style={{ ...thStyle, width: 60, textAlign: 'center' }}>Курс</th>
                  <th style={{ ...thStyle, width: 110 }}>Статус</th>
                  <th style={{ ...thStyle, width: 160 }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => {
                  const phone = s.person?.phones?.[0]?.number ?? null
                  const expelled = s.status === 'expelled'
                  return (
                    <tr
                      key={s.id}
                      style={{ borderTop: '1px solid #F3F4F6' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#FAFAFA' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 500 }}>
                        {s.person?.full_name ?? '—'}
                        {s.person?.hebrew_name && (
                          <div style={{ fontSize: 11, color: '#9CA3AF', direction: 'rtl', textAlign: 'left' }}>{s.person.hebrew_name}</div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {s.person?.email && <div style={{ color: '#374151' }}>{s.person.email}</div>}
                        {phone && <div style={{ color: '#6B7280', fontSize: 12 }}>{phone}</div>}
                        {!s.person?.email && !phone && <span style={{ color: '#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, color: '#6B7280' }}>{s.department?.name ?? '—'}</td>
                      <td style={{ ...tdStyle, color: '#6B7280' }}>{s.main_group?.name ?? <span style={{ color: '#D1D5DB' }}>—</span>}</td>
                      <td style={{ ...tdStyle, color: '#6B7280' }}>
                        {s.specialty
                          ? (s.specialty.code ? `[${s.specialty.code}] ${s.specialty.name}` : s.specialty.name)
                          : <span style={{ color: '#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center', color: '#6B7280' }}>
                        {s.year_level ?? <span style={{ color: '#D1D5DB' }}>—</span>}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500, whiteSpace: 'nowrap',
                          ...STATUS_STYLE[s.status],
                        }}>
                          {STATUS_LABEL[s.status]}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => alert('Редактирование пока через карточку студента, в разработке')} style={btnSecondary}>
                            Изменить
                          </button>
                          {!expelled && (
                            <button
                              onClick={() => handleExpel(s)}
                              style={{ ...btnSecondary, color: '#DC2626', borderColor: '#FCA5A5' }}
                            >
                              Отчислить
                            </button>
                          )}
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

      {modalOpen && (
        <EducationJourneyForm
          mode="student"
          onClose={() => setModalOpen(false)}
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
