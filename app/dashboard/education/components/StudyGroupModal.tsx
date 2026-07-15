'use client'

import { useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

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
  const t = useTranslations('education.study')
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
    if (!name.trim()) { setError(t('common.name_required')); return }
    if (!departmentId) { setError(t('common.department_required')); return }

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
        setError(errJson.error ?? `${t('common.error_generic')} ${resp.status}`)
        setSaving(false)
        return
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_send_generic'))
      setSaving(false)
    }
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }
  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid var(--border-strong)', borderRadius: 8,
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
          background: 'var(--surface)', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: 520,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {mode === 'create' ? t('groups.modal_create_title') : t('groups.modal_edit_title')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('common.name_label')} *</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              style={inp} autoFocus placeholder={t('groups.name_placeholder')}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('common.department_label')} *</label>
            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} style={inp}>
              <option value="">{t('common.select_placeholder')}</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('groups.specialty_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
            {!departmentId ? (
              <div style={{ padding: '7px 10px', fontSize: 13, color: 'var(--text-faint)', border: '1px solid var(--border)', borderRadius: 8 }}>
                {t('groups.select_dept_first')}
              </div>
            ) : specLoading ? (
              <div style={{ padding: '7px 10px', fontSize: 13, color: 'var(--text-faint)', border: '1px solid var(--border)', borderRadius: 8 }}>
                {t('common.loading')}
              </div>
            ) : specialties.length === 0 ? (
              <div style={{ padding: '7px 10px', fontSize: 13, color: 'var(--text-faint)', border: '1px solid var(--border)', borderRadius: 8 }}>
                {t('groups.specialty_none_for_dept')}
              </div>
            ) : (
              <select value={specialtyId} onChange={e => setSpecialtyId(e.target.value)} style={inp}>
                <option value="">{t('groups.specialty_none_option')}</option>
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
              <label style={lbl}>{t('groups.year_level_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
              <input
                type="number" value={yearLevel} onChange={e => setYearLevel(e.target.value)}
                style={inp} placeholder={t('groups.year_level_placeholder')} min={1} max={99}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>{t('groups.year_start_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
              <input
                type="number" value={yearStart} onChange={e => setYearStart(e.target.value)}
                style={inp} placeholder={t('groups.year_start_placeholder')} min={2000} max={2100}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('common.notes_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              rows={3} style={{ ...inp, resize: 'vertical' }}
              placeholder={t('common.notes_placeholder')}
            />
          </div>

          {mode === 'edit' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                {t('groups.active_checkbox')}
              </label>
            </div>
          )}

          {error && (
            <div style={{ padding: 10, marginBottom: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 6, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
            <button
              type="button" onClick={onClose} disabled={saving}
              style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit" disabled={saving}
              style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff', background: accent, border: 'none', borderRadius: 8, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? t('common.saving') : (mode === 'create' ? t('common.create') : t('common.save'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
