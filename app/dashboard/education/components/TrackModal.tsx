'use client'

import { useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { requiredFieldMsg } from '@/lib/i18n/required'
import { isValidTrackCode } from '@/lib/education/track-catalog'

export interface TrackRow {
  id: string
  code: string
  name_he: string
  name_ru: string
  name_en: string
  category: string | null
  years_count: number
  sort_order: number
  is_active: boolean
}

interface Props {
  mode: 'create' | 'edit'
  initial: TrackRow | null
  onClose: () => void
  onSaved: () => void
}

const accent = getModuleColor('education')

export default function TrackModal({ mode, initial, onClose, onSaved }: Props) {
  const t = useTranslations('education.tracks')
  const tCommon = useTranslations('common')
  const [code, setCode] = useState(initial?.code ?? '')
  const [nameHe, setNameHe] = useState(initial?.name_he ?? '')
  const [nameRu, setNameRu] = useState(initial?.name_ru ?? '')
  const [nameEn, setNameEn] = useState(initial?.name_en ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [yearsCount, setYearsCount] = useState(String(initial?.years_count ?? 4))
  const [sortOrder, setSortOrder] = useState(String(initial?.sort_order ?? 0))
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) { setError(requiredFieldMsg(tCommon, t('code_label'))); return }
    if (!isValidTrackCode(code)) { setError(t('code_format_error')); return }
    if (!nameHe.trim()) { setError(requiredFieldMsg(tCommon, t('name_he_label'))); return }
    if (!nameRu.trim()) { setError(requiredFieldMsg(tCommon, t('name_ru_label'))); return }
    if (!nameEn.trim()) { setError(requiredFieldMsg(tCommon, t('name_en_label'))); return }

    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        code: code.trim(),
        name_he: nameHe.trim(),
        name_ru: nameRu.trim(),
        name_en: nameEn.trim(),
        category: category.trim() || null,
        years_count: Number(yearsCount) || 4,
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
      }
      const url = mode === 'create'
        ? '/api/education/study-tracks'
        : `/api/education/study-tracks/${initial!.id}`
      const resp = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({})) as { error?: string }
        setError(errJson.error ?? `${tCommon('error')} ${resp.status}`)
        setSaving(false)
        return
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon('error'))
      setSaving(false)
    }
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }
  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid var(--border-strong)', borderRadius: 8,
    boxSizing: 'border-box', outline: 'none', background: 'var(--surface)', color: 'var(--text)',
  }

  return (
    <Modal onClose={onClose} maxWidth={480} closeOnBackdrop panelStyle={{ padding: 24, maxHeight: 'none', overflowY: 'visible' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          {mode === 'create' ? t('modal_create_title') : t('modal_edit_title')}
        </h2>
        <button onClick={onClose} aria-label={tCommon('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>{t('name_he_label')} *</label>
          <input type="text" value={nameHe} onChange={e => setNameHe(e.target.value)} style={inp} autoFocus dir="rtl" />
        </div>

        <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>{t('name_ru_label')} *</label>
            <input type="text" value={nameRu} onChange={e => setNameRu(e.target.value)} style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>{t('name_en_label')} *</label>
            <input type="text" value={nameEn} onChange={e => setNameEn(e.target.value)} style={inp} dir="ltr" />
          </div>
        </div>

        <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>{t('code_label')} *</label>
            <input type="text" value={code} onChange={e => setCode(e.target.value)} style={inp} dir="ltr" placeholder="univ_pr" />
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{t('code_hint')}</div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>{t('category_label')}</label>
            <input type="text" value={category} onChange={e => setCategory(e.target.value)} style={inp} dir="ltr" placeholder="university" />
          </div>
        </div>

        <div style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={lbl}>{t('years_count_label')}</label>
            <select value={yearsCount} onChange={e => setYearsCount(e.target.value)} style={inp}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={lbl}>{t('sort_order_label')}</label>
            <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={inp} min={0} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            {t('active_checkbox')}
          </label>
        </div>

        {error && (
          <div style={{ padding: 10, marginBottom: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 6, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
          <button type="button" onClick={onClose} disabled={saving} style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}>
            {tCommon('cancel')}
          </button>
          <SubmitButton type="submit" loading={saving} loadingLabel={tCommon('saving')} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff', background: accent, border: 'none', borderRadius: 8, opacity: saving ? 0.6 : 1 }}>
            {mode === 'create' ? tCommon('create') : tCommon('save')}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  )
}
