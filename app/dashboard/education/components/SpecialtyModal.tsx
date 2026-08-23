'use client'

import { useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { Modal } from '@/components/ui/Modal'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { localizedDeptName } from '@/lib/departments/localized-name'

interface Department {
  id: string
  name: string
  name_he?: string | null
  name_en?: string | null
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
  const tCommon = useTranslations('common')
  const { lang } = useLang()
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

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }
  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid var(--border-strong)', borderRadius: 8,
    boxSizing: 'border-box', outline: 'none',
  }

  return (
    <Modal onClose={onClose} maxWidth={480} closeOnBackdrop panelStyle={{ padding: 24, maxHeight: 'none', overflowY: 'visible' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {mode === 'create' ? t('specialties.modal_create_title') : t('specialties.modal_edit_title')}
          </h2>
          <button onClick={onClose} aria-label={tCommon('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
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
            <label style={lbl}>{t('specialties.code_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
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
                <option key={d.id} value={d.id}>{localizedDeptName(d, lang)}</option>
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
              padding: 10, marginBottom: 12, background: 'var(--danger-tint)',
              color: 'var(--danger)', borderRadius: 6, fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '8px 16px', fontSize: 13, color: 'var(--text)',
                background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer',
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
    </Modal>
  )
}
