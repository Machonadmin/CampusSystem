'use client'

import { useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { requiredFieldMsg } from '@/lib/i18n/required'

interface Track {
  id: string
  code: string
  name_he: string
  name_ru: string
  name_en: string
  years_count?: number
}

interface SubjectInitial {
  id: string
  name: string
  name_he: string | null
  sort_order: number
  is_active: boolean
  study_track_id: string | null
  year_level: number | null
}

interface Props {
  mode: 'create' | 'edit'
  initial: SubjectInitial | null
  tracks: Track[]
  onClose: () => void
  onSaved: () => void
}

const accent = getModuleColor('education')
const DEFAULT_PRICE = 210000

function trackName(tr: Track, lang: string): string {
  if (lang === 'he') return tr.name_he || tr.name_ru
  if (lang === 'en') return tr.name_en || tr.name_ru
  return tr.name_ru
}

export default function SubjectModal({ mode, initial, tracks, onClose, onSaved }: Props) {
  const t = useTranslations('education.study')
  const tCommon = useTranslations('common')
  const { lang } = useLang()
  const [name, setName] = useState(initial?.name ?? '')
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [trackId, setTrackId] = useState(initial?.study_track_id ?? '')
  const [yearLevel, setYearLevel] = useState(String(initial?.year_level ?? 1))
  const [price, setPrice] = useState(String(DEFAULT_PRICE))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // שנים אפשריות תלויות במסלול הנבחר (years_count). ברירת מחדל 4.
  const selectedTrack = tracks.find(tr => tr.id === trackId)
  const maxYears = Math.min(4, Math.max(1, selectedTrack?.years_count ?? 4))
  const YEARS = Array.from({ length: maxYears }, (_, i) => i + 1)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError(requiredFieldMsg(tCommon, t('subjects.name_field_label'))); return }
    if (!trackId) { setError(requiredFieldMsg(tCommon, t('subjects.track_label'))); return }

    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        sort_order: Number(sortOrder) || 0,
        study_track_id: trackId,
        year_level: Number(yearLevel) || 1,
      }
      if (mode === 'create') payload.tuition_amount = Number(price) >= 0 ? Number(price) : DEFAULT_PRICE
      if (mode === 'edit') payload.is_active = isActive

      const url = mode === 'create'
        ? '/api/education/subjects'
        : `/api/education/subjects/${initial!.id}`

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
          width: '100%', maxWidth: 480,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {mode === 'create' ? t('subjects.modal_create_title') : t('subjects.modal_edit_title')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('subjects.name_field_label')} *</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              style={inp} autoFocus placeholder={t('subjects.name_placeholder')}
            />
          </div>

          <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={lbl}>{t('subjects.track_label')} *</label>
              <select
                value={trackId}
                onChange={e => {
                  const id = e.target.value
                  setTrackId(id)
                  const tr = tracks.find(x => x.id === id)
                  const max = Math.min(4, Math.max(1, tr?.years_count ?? 4))
                  if (Number(yearLevel) > max) setYearLevel('1')
                }}
                style={inp}
              >
                <option value="">{t('common.select_placeholder')}</option>
                {tracks.map(tr => (
                  <option key={tr.id} value={tr.id}>{trackName(tr, lang)}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>{t('subjects.year_label')} *</label>
              <select value={yearLevel} onChange={e => setYearLevel(e.target.value)} style={inp}>
                {YEARS.map(y => (
                  <option key={y} value={y}>{t(`subjects.year_${y}`)}</option>
                ))}
              </select>
            </div>
          </div>

          {mode === 'create' && (
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>{t('subjects.semester_price_label')}</label>
              <input
                type="number" value={price} onChange={e => setPrice(e.target.value)}
                style={inp} min={0}
              />
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                {t('subjects.semester_price_hint')}
              </div>
            </div>
          )}

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
                  {t('subjects.active_checkbox')}
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
      </div>
    </div>
  )
}
