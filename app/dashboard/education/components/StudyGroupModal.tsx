'use client'

import { useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'

interface Department { id: string; name: string }
interface Specialty { id: string; name: string; code: string | null }

interface StudyGroupInitial {
  id: string
  name: string
  year_level: number | null
  year_start: number | null
  notes: string | null
  is_active: boolean
  department_id: string
  specialty_id: string | null
}

interface Props {
  mode: 'create' | 'edit'
  initial: StudyGroupInitial | null
  departments: Department[]
  onClose: () => void
  onSaved: () => void
}

const accent = getModuleColor('education')

export default function StudyGroupModal({ mode, initial, departments, onClose, onSaved }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [departmentId, setDepartmentId] = useState(initial?.department_id ?? '')
  const [specialtyId, setSpecialtyId] = useState(initial?.specialty_id ?? '')
  const [yearLevel, setYearLevel] = useState(initial?.year_level != null ? String(initial.year_level) : '')
  const [yearStart, setYearStart] = useState(initial?.year_start != null ? String(initial.year_start) : '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)

  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [specLoading, setSpecLoading] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Подгружаем специальности при выборе подразделения
  useEffect(() => {
    if (!departmentId) {
      setSpecialties([])
      setSpecialtyId('')
      return
    }
    setSpecLoading(true)
    fetch(`/api/education/specialties?department_id=${departmentId}&active_only=false`)
      .then(r => r.ok ? r.json() : { specialties: [] })
      .then(json => {
        const list: Specialty[] = json.specialties ?? []
        setSpecialties(list)
        // Сбросить specialtyId если он не принадлежит новому department
        setSpecialtyId(prev => list.some(s => s.id === prev) ? prev : '')
      })
      .catch(() => setSpecialties([]))
      .finally(() => setSpecLoading(false))
  }, [departmentId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Название обязательно'); return }
    if (!departmentId) { setError('Выберите подразделение'); return }

    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        department_id: departmentId,
        specialty_id: specialtyId || null,
        year_level: yearLevel !== '' ? Number(yearLevel) : null,
        year_start: yearStart !== '' ? Number(yearStart) : null,
        notes: notes.trim() || null,
      }
      if (mode === 'edit') payload.is_active = isActive

      const url = mode === 'create'
        ? '/api/education/study-groups'
        : `/api/education/study-groups/${initial!.id}`

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
          width: '100%', maxWidth: 520,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1F2937', margin: 0 }}>
            {mode === 'create' ? 'Новая базовая группа' : 'Редактирование группы'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Название *</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              style={inp} autoFocus placeholder="Группа А"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Подразделение *</label>
            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} style={inp}>
              <option value="">— выберите —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Специальность <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(необязательно)</span></label>
            {!departmentId ? (
              <div style={{ padding: '7px 10px', fontSize: 13, color: '#9CA3AF', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                Сначала выберите подразделение
              </div>
            ) : specLoading ? (
              <div style={{ padding: '7px 10px', fontSize: 13, color: '#9CA3AF', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                Загрузка…
              </div>
            ) : specialties.length === 0 ? (
              <div style={{ padding: '7px 10px', fontSize: 13, color: '#9CA3AF', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                У этого подразделения нет специальностей
              </div>
            ) : (
              <select value={specialtyId} onChange={e => setSpecialtyId(e.target.value)} style={inp}>
                <option value="">— без специальности —</option>
                {specialties.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.code ? `[${s.code}] ${s.name}` : s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Курс / Класс <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(необяз.)</span></label>
              <input
                type="number" value={yearLevel} onChange={e => setYearLevel(e.target.value)}
                style={inp} placeholder="1, 2, 10…" min={1} max={99}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Год набора <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(необяз.)</span></label>
              <input
                type="number" value={yearStart} onChange={e => setYearStart(e.target.value)}
                style={inp} placeholder="2025" min={2000} max={2100}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Заметки <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(необязательно)</span></label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} style={{ ...inp, resize: 'vertical' }}
              placeholder="Дополнительная информация…"
            />
          </div>

          {mode === 'edit' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                Активная
              </label>
            </div>
          )}

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
              type="submit" disabled={saving}
              style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff', background: accent, border: 'none', borderRadius: 8, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Сохранение…' : (mode === 'create' ? 'Создать' : 'Сохранить')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
