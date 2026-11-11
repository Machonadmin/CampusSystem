'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import AlumniFormModal, { type AlumniFormValues } from './AlumniFormModal'

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
  /** Профиль выпускника. null — строки alumni_profiles ещё нет (создастся при первой правке). */
  profile: AlumniProfileData | null
  canManage: boolean
  /** id дела выпускницы — для правки и удаления. */
  journeyId: string
  /** Текущие значения формы (личные данные + профиль) для окна правки. */
  formValues: AlumniFormValues
  /** Год поступления (education_journeys.year_start). */
  yearStart: number | null
  /** Заметка в деле (education_journeys.notes) — у импортированных из Excel там всё из файла. */
  journeyNote: string | null
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
      <div style={{ fontSize: 13, color: 'var(--text-faint)', minWidth: 160, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{value || '—'}</div>
    </div>
  )
}

/**
 * Панель «פרופיל בוגרת» в карточке. Просмотр — всем с alumni.view.
 * С alumni.manage: «עריכה» (окно со ВСЕМИ полями — личными и выпуска) и
 * «מחיקה» (мягкое удаление дела выпускницы, с подтверждением).
 */
export default function AlumniProfilePanel({ profile, canManage, journeyId, formValues, yearStart, journeyNote }: Props) {
  const t = useTranslations('alumni')
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    const ok = await confirmDialog({
      title: t('card.delete_title'),
      message: t('card.delete_confirm'),
      confirmLabel: t('card.delete'),
      tone: 'danger',
    })
    if (!ok) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/alumni/journeys/${journeyId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? t('card.delete_error'))
        return
      }
      router.push('/dashboard/alumni')
      router.refresh()
    } catch {
      setError(t('card.delete_error'))
    } finally {
      setDeleting(false)
    }
  }

  const btn = (danger: boolean): React.CSSProperties => ({
    padding: '5px 12px', fontSize: 12, fontWeight: 500, border: 'none', borderRadius: 8, cursor: 'pointer',
    background: danger ? 'var(--danger-tint)' : 'var(--violet-tint)',
    color: danger ? 'var(--danger)' : 'var(--violet)',
  })

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('card.profile_title')}
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setEditing(true)} style={btn(false)}>{t('card.edit')}</button>
            <button onClick={remove} disabled={deleting} style={{ ...btn(true), opacity: deleting ? 0.6 : 1 }}>
              {t('card.delete')}
            </button>
          </div>
        )}
      </div>

      <Field label={t('card.year_start')} value={yearStart ?? '—'} />
      {profile ? (
        <>
          <Field label={t('card.graduation_year')} value={profile.graduation_year ?? '—'} />
          <Field label={t('card.institution')} value={profile.institution} />
          <Field label={t('card.direction')} value={profile.direction} />
          <div style={{ height: 1, background: 'var(--surface-2)', margin: '12px 0' }} />
          <Field label={t('card.current_location')} value={profile.current_location} />
          <Field label={t('card.current_occupation')} value={profile.current_occupation} />
          <Field label={t('card.notes')} value={profile.notes} />
        </>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('card.no_profile')}</div>
      )}
      {journeyNote && <Field label={t('card.journey_note')} value={journeyNote} />}

      {error && <div role="alert" style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</div>}

      {editing && (
        <AlumniFormModal
          mode="edit"
          journeyId={journeyId}
          initial={formValues}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); router.refresh() }}
        />
      )}
    </div>
  )
}
