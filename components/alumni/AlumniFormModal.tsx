'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Modal } from '@/components/ui/Modal'
import { FormField, FormGrid, FormSection } from '@/components/ui/FormField'

/** Значения формы выпускницы (все строки — как в полях ввода). */
export interface AlumniFormValues {
  last_name: string
  first_name: string
  middle_name: string
  hebrew_name: string
  birth_date: string // YYYY-MM-DD или ''
  phones: string // через запятую
  email: string
  country: string
  city: string
  graduation_year: string
  institution: string
  direction: string
  current_location: string
  current_occupation: string
  notes: string
}

export const EMPTY_ALUMNI_FORM: AlumniFormValues = {
  last_name: '', first_name: '', middle_name: '', hebrew_name: '', birth_date: '',
  phones: '', email: '', country: '', city: '',
  graduation_year: '', institution: '', direction: '',
  current_location: '', current_occupation: '', notes: '',
}

interface Props {
  /** 'create' — новая выпускница (POST /api/alumni); 'edit' — правка (PATCH по journeyId). */
  mode: 'create' | 'edit'
  journeyId?: string
  initial?: AlumniFormValues
  onClose: () => void
  /** Успех: id дела выпускницы (для create — новой). */
  onSaved: (journeyId: string) => void
}

/**
 * Окно «בוגרת חדשה» / «עריכת פרטי בוגרת». Одна форма на оба случая: личные
 * данные (persons) и данные выпуска (alumni_profiles). Сохранять может только
 * тот, у кого alumni.manage — сервер проверяет это сам.
 */
export default function AlumniFormModal({ mode, journeyId, initial, onClose, onSaved }: Props) {
  const t = useTranslations('alumni')
  const [v, setV] = useState<AlumniFormValues>(initial ?? EMPTY_ALUMNI_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof AlumniFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(prev => ({ ...prev, [k]: e.target.value }))

  async function save() {
    if (!v.first_name.trim()) { setError(t('form.name_required')); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(mode === 'create' ? '/api/alumni' : `/api/alumni/journeys/${journeyId}`, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? t('card.save_error'))
        return
      }
      onSaved(mode === 'create' ? body.journey_id : journeyId!)
    } catch {
      setError(t('card.save_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      maxWidth={720}
      title={mode === 'create' ? t('form.new_title') : t('form.edit_title')}
      footer={
        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: '9px 20px', fontSize: 13, fontWeight: 600,
            background: 'var(--action)', boxShadow: 'inset 0 0 0 1px var(--action-border)', color: 'var(--action-contrast)',
            border: 'none', borderRadius: 8, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? t('card.saving') : t('card.save')}
        </button>
      }
    >
      <div style={{ display: 'grid', gap: 18 }}>
        <FormSection title={t('form.section_personal')}>
          <FormGrid>
            <FormField label={t('form.last_name')}>
              <input style={inp} value={v.last_name} onChange={set('last_name')} />
            </FormField>
            <FormField label={t('form.first_name')} required>
              <input style={inp} value={v.first_name} onChange={set('first_name')} />
            </FormField>
            <FormField label={t('form.middle_name')}>
              <input style={inp} value={v.middle_name} onChange={set('middle_name')} />
            </FormField>
            <FormField label={t('form.hebrew_name')}>
              <input style={inp} value={v.hebrew_name} onChange={set('hebrew_name')} />
            </FormField>
            <FormField label={t('form.birth_date')}>
              <input type="date" style={inp} value={v.birth_date} onChange={set('birth_date')} />
            </FormField>
            <FormField label={t('form.email')}>
              <input type="email" dir="ltr" style={inp} value={v.email} onChange={set('email')} />
            </FormField>
            <FormField label={t('form.phones')} hint={t('form.phones_hint')} full>
              <input dir="ltr" style={inp} value={v.phones} onChange={set('phones')} />
            </FormField>
            <FormField label={t('form.country')}>
              <input style={inp} value={v.country} onChange={set('country')} />
            </FormField>
            <FormField label={t('form.city')}>
              <input style={inp} value={v.city} onChange={set('city')} />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection title={t('card.profile_title')}>
          <FormGrid>
            <FormField label={t('card.graduation_year')}>
              <input inputMode="numeric" style={inp} value={v.graduation_year} onChange={set('graduation_year')} />
            </FormField>
            <FormField label={t('card.institution')}>
              <input style={inp} value={v.institution} onChange={set('institution')} />
            </FormField>
            <FormField label={t('card.direction')}>
              <input style={inp} value={v.direction} onChange={set('direction')} />
            </FormField>
            <FormField label={t('card.current_location')}>
              <input style={inp} value={v.current_location} onChange={set('current_location')} />
            </FormField>
            <FormField label={t('card.current_occupation')} full>
              <input style={inp} value={v.current_occupation} onChange={set('current_occupation')} />
            </FormField>
            <FormField label={t('card.notes')} full>
              <textarea style={{ ...inp, minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }} value={v.notes} onChange={set('notes')} />
            </FormField>
          </FormGrid>
        </FormSection>

        {error && <div role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</div>}
      </div>
    </Modal>
  )
}

const inp: React.CSSProperties = {
  fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8,
  color: 'var(--text)', width: '100%', background: 'var(--surface)', boxSizing: 'border-box',
}
