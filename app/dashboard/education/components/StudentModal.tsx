'use client'

import { useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { PersonSelect } from '@/components/ui/person-select'

interface Department { id: string; name: string }
interface Specialty { id: string; name: string; code: string | null }
interface StudyGroup { id: string; name: string }

type StudentStatus = 'active' | 'on_leave' | 'graduated' | 'expelled'

interface StudentInitial {
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
  person: { id: string; full_name: string } | null
}

interface Props {
  mode: 'create' | 'edit'
  initial: StudentInitial | null
  departments: Department[]
  onClose: () => void
  onSaved: () => void
}

const accent = getModuleColor('education')
const todayIso = new Date().toISOString().split('T')[0]

export default function StudentModal({ mode, initial, departments, onClose, onSaved }: Props) {
  const [personId, setPersonId] = useState<string | null>(initial?.person_id ?? null)
  const [departmentId, setDepartmentId] = useState(initial?.primary_department_id ?? '')
  const [specialtyId, setSpecialtyId] = useState(initial?.specialty_id ?? '')
  const [groupId, setGroupId] = useState(initial?.main_group_id ?? '')
  const [yearLevel, setYearLevel] = useState(initial?.year_level != null ? String(initial.year_level) : '')
  const [yearStart, setYearStart] = useState(initial?.year_start != null ? String(initial.year_start) : '')
  const [enrolledAt, setEnrolledAt] = useState(initial?.enrolled_at ?? todayIso)
  const [status, setStatus] = useState<StudentStatus>(initial?.status ?? 'active')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [studyGroups, setStudyGroups] = useState<StudyGroup[]>([])
  const [depsLoading, setDepsLoading] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Каскадная загрузка специальностей и групп при смене подразделения
  useEffect(() => {
    if (!departmentId) {
      setSpecialties([])
      setStudyGroups([])
      setSpecialtyId('')
      setGroupId('')
      return
    }
    setDepsLoading(true)
    Promise.all([
      fetch(`/api/education/specialties?department_id=${departmentId}&active_only=false`).then(r => r.ok ? r.json() : { specialties: [] }),
      fetch(`/api/education/study-groups?department_id=${departmentId}&active_only=false`).then(r => r.ok ? r.json() : { study_groups: [] }),
    ]).then(([sJson, gJson]) => {
      const specs: Specialty[] = sJson.specialties ?? []
      const grps: StudyGroup[] = (gJson.study_groups ?? []).map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))
      setSpecialties(specs)
      setStudyGroups(grps)
      setSpecialtyId(prev => specs.some(s => s.id === prev) ? prev : '')
      setGroupId(prev => grps.some(g => g.id === prev) ? prev : '')
    }).catch(() => {
      setSpecialties([])
      setStudyGroups([])
    }).finally(() => setDepsLoading(false))
  }, [departmentId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'create' && !personId) { setError('Выберите или создайте человека'); return }
    if (!departmentId) { setError('Выберите подразделение'); return }

    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        primary_department_id: departmentId,
        specialty_id: specialtyId || null,
        main_group_id: groupId || null,
        year_level: yearLevel !== '' ? Number(yearLevel) : null,
        year_start: yearStart !== '' ? Number(yearStart) : null,
        enrolled_at: enrolledAt || null,
        notes: notes.trim() || null,
      }
      if (mode === 'create') {
        payload.person_id = personId
      } else {
        payload.status = status
      }

      const url = mode === 'create'
        ? '/api/education/students'
        : `/api/education/students/${initial!.id}`

      const resp = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}))
        setError(errJson.error ?? `Ошибка ${resp.status}`)
        setSaving(false)
        return
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки')
      setSaving(false)
    }
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }
  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid #D1D5DB', borderRadius: 8,
    boxSizing: 'border-box', outline: 'none',
  }
  const hint: React.CSSProperties = { padding: '7px 10px', fontSize: 13, color: '#9CA3AF', border: '1px solid #E5E7EB', borderRadius: 8 }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: 540,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1F2937', margin: 0 }}>
            {mode === 'create' ? 'Новый студент' : 'Редактирование студента'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Человек */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Человек *</label>
            {mode === 'create' ? (
              <PersonSelect
                value={personId}
                onChange={id => setPersonId(id)}
                placeholder="Выберите или создайте человека…"
                accentColor={accent}
              />
            ) : (
              <div style={{ ...hint, color: '#374151', background: '#F9FAFB' }}>
                {initial?.person?.full_name ?? '—'}
              </div>
            )}
          </div>

          {/* Подразделение */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Подразделение *</label>
            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} style={inp}>
              <option value="">— выберите —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Специальность */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Специальность <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(необязательно)</span></label>
            {!departmentId ? (
              <div style={hint}>Сначала выберите подразделение</div>
            ) : depsLoading ? (
              <div style={hint}>Загрузка…</div>
            ) : specialties.length === 0 ? (
              <div style={hint}>У этого подразделения нет специальностей</div>
            ) : (
              <select value={specialtyId} onChange={e => setSpecialtyId(e.target.value)} style={inp}>
                <option value="">— без специальности —</option>
                {specialties.map(s => (
                  <option key={s.id} value={s.id}>{s.code ? `[${s.code}] ${s.name}` : s.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Базовая группа */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Базовая группа <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(необязательно)</span></label>
            {!departmentId ? (
              <div style={hint}>Сначала выберите подразделение</div>
            ) : depsLoading ? (
              <div style={hint}>Загрузка…</div>
            ) : studyGroups.length === 0 ? (
              <div style={hint}>У этого подразделения нет базовых групп</div>
            ) : (
              <select value={groupId} onChange={e => setGroupId(e.target.value)} style={inp}>
                <option value="">— без группы —</option>
                {studyGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
          </div>

          {/* Курс + Год набора */}
          <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Курс / Класс <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(необяз.)</span></label>
              <input type="number" value={yearLevel} onChange={e => setYearLevel(e.target.value)} style={inp} placeholder="1, 2…" min={1} max={99} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Год набора <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(необяз.)</span></label>
              <input type="number" value={yearStart} onChange={e => setYearStart(e.target.value)} style={inp} placeholder="2025" min={2000} max={2100} />
            </div>
          </div>

          {/* Дата зачисления */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Дата зачисления</label>
            <input type="date" value={enrolledAt} onChange={e => setEnrolledAt(e.target.value)} style={inp} />
          </div>

          {/* Статус — только в edit */}
          {mode === 'edit' && (
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Статус</label>
              <select value={status} onChange={e => setStatus(e.target.value as StudentStatus)} style={inp}>
                <option value="active">Активен</option>
                <option value="on_leave">Академотпуск</option>
                <option value="graduated">Выпускник</option>
                <option value="expelled">Отчислен</option>
              </select>
            </div>
          )}

          {/* Заметки */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Заметки <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(необязательно)</span></label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} style={{ ...inp, resize: 'vertical' }}
              placeholder="Дополнительная информация…"
            />
          </div>

          {error && (
            <div style={{ padding: 10, marginBottom: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 6, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
            <button
              type="button" onClick={onClose} disabled={saving}
              style={{ padding: '8px 16px', fontSize: 13, color: '#374151', background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, cursor: 'pointer' }}
            >
              Отмена
            </button>
            <button
              type="submit" disabled={saving || (mode === 'create' && !personId)}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff',
                background: accent, border: 'none', borderRadius: 8,
                cursor: (saving || (mode === 'create' && !personId)) ? 'not-allowed' : 'pointer',
                opacity: (saving || (mode === 'create' && !personId)) ? 0.5 : 1,
              }}
            >
              {saving ? 'Сохранение…' : (mode === 'create' ? 'Создать' : 'Сохранить')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
