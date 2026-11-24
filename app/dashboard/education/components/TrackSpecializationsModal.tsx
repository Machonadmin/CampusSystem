'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toastError } from '@/components/ui/toast'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { isValidTrackCode } from '@/lib/education/track-catalog'

export interface SpecializationLite {
  id: string
  code: string
  name_he: string
  name_ru: string
  name_en: string
  is_active: boolean
}

interface Props {
  trackId: string
  trackName: string
  specializations: SpecializationLite[]
  onClose: () => void
  onChanged: () => void
}

/** מגמות בתוך מסלול (напр. אוניברסיטה → כלכלה, פרסום). Право: manage_tracks. */
export default function TrackSpecializationsModal({ trackId, trackName, specializations, onClose, onChanged }: Props) {
  const t = useTranslations('education.tracks')
  const tCommon = useTranslations('common')
  const { lang } = useLang()
  const [nameHe, setNameHe] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const label = (s: SpecializationLite) => (lang === 'ru' ? s.name_ru : lang === 'en' ? s.name_en : s.name_he) || s.name_he

  const add = async () => {
    if (!nameHe.trim()) { toastError(t('spec_name_required')); return }
    if (!isValidTrackCode(code)) { toastError(t('code_format_error')); return }
    setBusy(true)
    try {
      const r = await fetch(`/api/education/study-tracks/${trackId}/specializations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), name_he: nameHe.trim() }),
      })
      if (!r.ok) { const b = await r.json().catch(() => ({})); toastError(b.error ?? tCommon('error')); return }
      setNameHe(''); setCode('')
      onChanged()
    } finally { setBusy(false) }
  }

  const toggle = async (s: SpecializationLite) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/education/study-tracks/${trackId}/specializations/${s.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !s.is_active }),
      })
      if (!r.ok) { const b = await r.json().catch(() => ({})); toastError(b.error ?? tCommon('error')); return }
      onChanged()
    } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = {
    padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8,
    background: 'var(--surface)', color: 'var(--text)', outline: 'none', minWidth: 0,
  }

  return (
    <Modal onClose={onClose} maxWidth={460} closeOnBackdrop panelStyle={{ padding: 24, maxHeight: 'none', overflowY: 'visible' }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>
        {t('spec_title').replace('{name}', trackName)}
      </h2>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>{t('spec_hint')}</div>

      <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
        {specializations.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('spec_empty')}</span>}
        {specializations.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
            <span style={{ color: s.is_active ? 'var(--text)' : 'var(--text-faint)' }}>
              {label(s)}{!s.is_active && ` · ${t('status_inactive')}`}
            </span>
            <Button size="sm" onClick={() => toggle(s)} disabled={busy}>{s.is_active ? t('spec_deactivate') : t('spec_activate')}</Button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input aria-label={t('spec_name_label')} placeholder={t('spec_name_label')} value={nameHe} onChange={e => setNameHe(e.target.value)} style={{ ...inp, flex: 2 }} dir="rtl" />
        <input aria-label={t('code_label')} placeholder="economics" value={code} onChange={e => setCode(e.target.value)} style={{ ...inp, flex: 1 }} dir="ltr" />
        <Button variant="primary" size="sm" onClick={add} disabled={busy}>{t('spec_add')}</Button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{t('code_hint')}</div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <Button onClick={onClose}>{tCommon('close')}</Button>
      </div>
    </Modal>
  )
}
