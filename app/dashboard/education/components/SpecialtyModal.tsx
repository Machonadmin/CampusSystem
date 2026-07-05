'use client'

import { useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Department {
  id: string
  name: string
}

interface SpecialtyInitial {
  id: string
  name: string
  code: string | null
  sort_order: number
  is_active: boolean
  department_id: string
}

interface Props {
  mode: 'create' | 'edit'
  initial: SpecialtyInitial | null
  departments: Department[]
  onClose: () => void
  onSaved: () => void
}

const accent = getModuleColor('education')

export default function SpecialtyModal({ mode, initial, departments, onClose, onSaved }: Props) {
  const t = useTranslations('education.study')
  const [name, setName] = useState(initial?.name ?? '')
  const [code, setCode] = useState(initial?.code ?? '')
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [departmentId, setDepartmentId] = useState(initial?.department_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError(t('common.name_required')); return }
    if (!departmentId) { setError(t('common.department_required')); return }

    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        code: code.trim() || null,
        sort_order: Number(sortOrder) || 0,
        department_id: departmentId,
      }
      if (mode === 'edit') payload.is_active = isActive

      const url = mode === 'create'
        ? '/api/education/specialties'
        : `/api/education/specialties/${initial!.id}`

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
          width: '100%', maxWidth: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1F2937', margin: 0 }}>
            {mode === 'create' ? t('specialties.modal_create_title') : t('specialties.modal_edit_title')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('common.name_label')} *</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              style={inp} autoFocus placeholder={t('specialties.name_placeholder')}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('specialties.code_label')} <span style={{ fontWeight: 400, color: '#9CA3AF' }}>{t('common.optional_suffix')}</span></label>
            <input
              type="text" value={code} onChange={e => setCode(e.target.value)}
              style={inp} placeholder={t('specialties.code_placeholder')}
              maxLength={50}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('common.department_label')} *</label>
            <select
              value={departmentId}
              onChange={e => setDepartmentId(e.target.value)}
              style={inp}
            >
              <option value="">{t('common.select_placeholder')}</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>{t('common.sort_order_label')}</label>
              <input
                type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)}
                style={inp} min={0}
              />
            </div>
            {mode === 'edit' && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={e => setIsActive(e.target.checked)}
                  />
                  {t('specialties.active_checkbox')}
                </label>
              </div>
            )}
          </div>

          {error && (
            <div style={{
              padding: 10, marginBottom: 12, background: '#FEE2E2',
              color: '#991B1B', borderRadius: 6, fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '8px 16px', fontSize: 13, color: '#374151',
                background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, cursor: 'pointer',
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff',
                background: accent, border: 'none', borderRadius: 8,
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? t('common.saving') : (mode === 'create' ? t('common.create') : t('common.save'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
