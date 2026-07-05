'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

export interface AlumniProfileData {
  id: string
  graduation_year: number | null
  institution: string | null
  direction: string | null
  current_location: string | null
  current_occupation: string | null
  notes: string | null
}

interface Props {
  /** Профиль выпускника. null — строки alumni_profiles ещё нет (например, выпуск до миграции). */
  profile: AlumniProfileData | null
  canManage: boolean
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
      <div style={{ fontSize: 13, color: '#9CA3AF', minWidth: 160, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#1F2937' }}>{value || '—'}</div>
    </div>
  )
}

export default function AlumniProfilePanel({ profile, canManage }: Props) {
  const t = useTranslations('alumni')

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [location, setLocation] = useState(profile?.current_location ?? '')
  const [occupation, setOccupation] = useState(profile?.current_occupation ?? '')
  const [notes, setNotes] = useState(profile?.notes ?? '')

  // Актуальные (сохранённые) значения для просмотра.
  const [saved, setSaved] = useState({
    current_location: profile?.current_location ?? null,
    current_occupation: profile?.current_occupation ?? null,
    notes: profile?.notes ?? null,
  })

  const title = t('card.profile_title')

  const box: React.CSSProperties = {
    background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px',
  }
  const heading = (
    <div style={{
      fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase',
      letterSpacing: 0.5, marginBottom: 12,
    }}>
      {title}
    </div>
  )

  if (!profile) {
    return (
      <div style={box}>
        {heading}
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('card.no_profile')}</div>
      </div>
    )
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/alumni/${profile!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_location: location.trim() || null,
          current_occupation: occupation.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? t('card.save_error'))
        return
      }
      const updated = await res.json()
      setSaved({
        current_location: updated.current_location ?? null,
        current_occupation: updated.current_occupation ?? null,
        notes: updated.notes ?? null,
      })
      setEditing(false)
    } catch {
      setError(t('card.save_error'))
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setLocation(saved.current_location ?? '')
    setOccupation(saved.current_occupation ?? '')
    setNotes(saved.notes ?? '')
    setError(null)
    setEditing(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: 13, padding: '7px 10px',
    border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937',
  }
  const labelStyle: React.CSSProperties = { fontSize: 13, color: '#9CA3AF', marginBottom: 4 }

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          {title}
        </div>
        {canManage && !editing && (
          <button
            onClick={() => setEditing(true)}
            style={{
              padding: '5px 12px', fontSize: 12, fontWeight: 500,
              background: '#FCE7F3', color: '#9D174D', border: 'none', borderRadius: 8, cursor: 'pointer',
            }}
          >
            {t('card.edit')}
          </button>
        )}
      </div>

      {/* Данные выпуска — только просмотр (наполняются автоматически при выпуске) */}
      <Field label={t('card.graduation_year')} value={profile.graduation_year ?? '—'} />
      <Field label={t('card.institution')} value={profile.institution} />
      <Field label={t('card.direction')} value={profile.direction} />

      <div style={{ height: 1, background: '#F3F4F6', margin: '12px 0' }} />

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={labelStyle}>{t('card.current_location')}</div>
            <input style={inputStyle} value={location} onChange={e => setLocation(e.target.value)} />
          </div>
          <div>
            <div style={labelStyle}>{t('card.current_occupation')}</div>
            <input style={inputStyle} value={occupation} onChange={e => setOccupation(e.target.value)} />
          </div>
          <div>
            <div style={labelStyle}>{t('card.notes')}</div>
            <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {error && <div style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding: '7px 16px', fontSize: 13, fontWeight: 500,
                background: '#DB2777', color: '#fff', border: 'none', borderRadius: 8,
                cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? t('card.saving') : t('card.save')}
            </button>
            <button
              onClick={cancel}
              disabled={saving}
              style={{
                padding: '7px 16px', fontSize: 13, fontWeight: 500,
                background: '#F3F4F6', color: '#4B5563', border: 'none', borderRadius: 8, cursor: 'pointer',
              }}
            >
              {t('card.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <Field label={t('card.current_location')} value={saved.current_location} />
          <Field label={t('card.current_occupation')} value={saved.current_occupation} />
          <Field label={t('card.notes')} value={saved.notes} />
        </>
      )}
    </div>
  )
}
