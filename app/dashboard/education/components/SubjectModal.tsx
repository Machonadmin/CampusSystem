'use client'

import { useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { requiredFieldMsg } from '@/lib/i18n/required'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import YearLevelSelect from './YearLevelSelect'

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
  name_ru: string | null
  name_en: string | null
  sort_order: number
  is_active: boolean
  study_track_id: string | null
  year_level: number | null
}

/** Предзаполнение при создании (например, из контекста маршрута/года). Пока не используется. */
interface SubjectDefaults {
  study_track_id?: string
  year_level?: number
}

interface Props {
  mode: 'create' | 'edit'
  initial: SubjectInitial | null
  tracks: Track[]
  defaults?: SubjectDefaults
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

export default function SubjectModal({ mode, initial, tracks, defaults, onClose, onSaved }: Props) {
  const t = useTranslations('education.study')
  const tCommon = useTranslations('common')
  const { lang } = useLang()
  const [nameHe, setNameHe] = useState(initial?.name_he ?? '')
  const [nameRu, setNameRu] = useState(initial?.name_ru ?? initial?.name ?? '')
  const [nameEn, setNameEn] = useState(initial?.name_en ?? '')
  // sort_order сохраняется в фоне (поле убрано из формы); при редактировании
  // сохраняем прежнее значение, у новых предметов — 0.
  const [sortOrder] = useState(String(initial?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  // defaults — только при создании (при редактировании значения берутся из initial).
  const createDefaults = mode === 'create' ? defaults : undefined
  const [trackId, setTrackId] = useState(initial?.study_track_id ?? createDefaults?.study_track_id ?? '')
  const [yearLevel, setYearLevel] = useState(String(initial?.year_level ?? createDefaults?.year_level ?? 1))
  const [price, setPrice] = useState(String(DEFAULT_PRICE))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // שנים אפשריות תלויות במסלול הנבחר (years_count). ברירת מחדל 4 — в YearLevelSelect.
  const selectedTrack = tracks.find(tr => tr.id === trackId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nameHe.trim()) { setError(requiredFieldMsg(tCommon, t('subjects.name_field_label'))); return }
    if (!trackId) { setError(requiredFieldMsg(tCommon, t('subjects.track_label'))); return }
    await send(false)
  }

  // force=true — повторная отправка после подтверждения «ליצור בכל זאת?»
  // (сервер вернул 409 subject_exists: такой предмет уже есть на маршруте+году).
  const send = async (force: boolean) => {
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        name_he: nameHe.trim(),
        name_ru: nameRu.trim() || null,
        name_en: nameEn.trim() || null,
        sort_order: Number(sortOrder) || 0,
        study_track_id: trackId,
        year_level: Number(yearLevel) || 1,
      }
      if (mode === 'create') payload.tuition_amount = Number(price) >= 0 ? Number(price) : DEFAULT_PRICE
      if (mode === 'edit') payload.is_active = isActive
      if (force) payload.force = true

      const url = mode === 'create'
        ? '/api/education/subjects'
        : `/api/education/subjects/${initial!.id}`

      const resp = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({})) as { error?: string; code?: string }
        if (mode === 'create' && !force && resp.status === 409 && errJson.code === 'subject_exists') {
          const ok = await confirmDialog({
            message: `${errJson.error ?? ''}\n\n${t('common.create_anyway_confirm')}`,
          })
          if (ok) { await send(true); return }
        }
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
            {mode === 'create' ? t('subjects.modal_create_title') : t('subjects.modal_edit_title')}
          </h2>
          <button onClick={onClose} aria-label={tCommon('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('subjects.name_field_label')} *</label>
            <input aria-label={t('subjects.name_field_label')}
              type="text" value={nameHe} onChange={e => setNameHe(e.target.value)}
              style={inp} autoFocus placeholder={t('subjects.name_placeholder')} dir="rtl"
            />
          </div>

          <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>{t('subjects.name_ru_label')}</label>
              <input aria-label={t('subjects.name_ru_label')}
                type="text" value={nameRu} onChange={e => setNameRu(e.target.value)}
                style={inp} placeholder={t('subjects.name_ru_label')}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>{t('subjects.name_en_label')}</label>
              <input aria-label={t('subjects.name_en_label')}
                type="text" value={nameEn} onChange={e => setNameEn(e.target.value)}
                style={inp} placeholder={t('subjects.name_en_label')} dir="ltr"
              />
            </div>
          </div>

          <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={lbl}>{t('subjects.track_label')} *</label>
              <select aria-label={t('subjects.track_label')}
                value={trackId}
                onChange={e => {
                  const id = e.target.value
                  setTrackId(id)
                  const tr = tracks.find(x => x.id === id)
                  const max = Math.max(1, tr?.years_count ?? 4)
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
              <YearLevelSelect
                ariaLabel={t('subjects.year_label')}
                value={yearLevel}
                onChange={setYearLevel}
                yearsCount={selectedTrack?.years_count}
                style={inp}
              />
            </div>
          </div>

          {mode === 'create' && (
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>{t('subjects.semester_price_label')}</label>
              <input aria-label={t('subjects.semester_price_label')}
                type="number" value={price} onChange={e => setPrice(e.target.value)}
                style={inp} min={0}
              />
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                {t('subjects.semester_price_hint')}
              </div>
            </div>
          )}

          {/* «סדר מיון» убрали из формы по просьбе владельца — лишнее поле.
              sort_order сохраняется в фоне (0 у новых, прежнее — при редактировании). */}
          {mode === 'edit' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                />
                {t('subjects.active_checkbox')}
              </label>
            </div>
          )}

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
            <SubmitButton
              type="submit"
              loading={saving}
              loadingLabel={t('common.saving')}
              style={{
                padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff',
                background: accent, border: 'none', borderRadius: 8,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {mode === 'create' ? t('common.create') : t('common.save')}
            </SubmitButton>
          </div>
        </form>
    </Modal>
  )
}
