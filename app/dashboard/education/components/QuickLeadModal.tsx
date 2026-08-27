'use client'

import { useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'

// Источники по бизнес-процессу v2 (как в EducationJourneyForm).
const SOURCE_CODES = ['self', 'event_community', 'referral', 'import']

const accent = getModuleColor('education')

/**
 * Быстрое создание лида (owner: «6 שלבים בשביל 3 שדות חובה» — перебор).
 * Только то, что реально нужно секретарю в момент звонка: имя, телефон,
 * источник, комментарий. Остальное дозаполняется потом в карточке (עריכה).
 * Ссылка «טופס מלא» открывает старый полный мастер (onFullForm).
 */
export default function QuickLeadModal({ onClose, onSaved, onFullForm }: {
  onClose: () => void
  onSaved: () => void
  onFullForm: () => void
}) {
  const t = useTranslations('education')
  const tCommon = useTranslations('common')

  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!lastName.trim()) { setError(t('form.required_last_name')); return }
    if (!firstName.trim()) { setError(t('form.required_first_name')); return }
    if (!phone.trim()) { setError(t('form.required_phone_short')); return }
    setSaving(true); setError(null)
    try {
      // Тот же контракт, что и полный мастер (POST /api/applications).
      const res = await fetch('/api/applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          last_name: lastName.trim(),
          first_name: firstName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          referral_source: source || undefined,
          comment: comment.trim() || undefined,
          interests: [],
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? tCommon('error'))
        setSaving(false)
        return
      }
      onSaved()
    } catch {
      setError(tCommon('error'))
      setSaving(false)
    }
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, boxSizing: 'border-box', outline: 'none' }

  return (
    <Modal onClose={onClose} maxWidth={440} closeOnBackdrop panelStyle={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('quick_lead.title')}</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '0 0 16px' }}>{t('quick_lead.hint')}</p>

      <form onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={lbl}>{t('card.labels.last_name')} *</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} style={inp} autoFocus />
          </div>
          <div>
            <label style={lbl}>{t('card.labels.first_name')} *</label>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inp} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={lbl}>{t('card.labels.phone')} *</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} style={inp} inputMode="tel" dir="ltr" />
          </div>
          <div>
            <label style={lbl}>{t('card.labels.email')}</label>
            <input value={email} onChange={e => setEmail(e.target.value)} style={inp} inputMode="email" dir="ltr" />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>{t('card.labels.referral_source')}</label>
          <select value={source} onChange={e => setSource(e.target.value)} style={inp}>
            <option value="">—</option>
            {SOURCE_CODES.map(c => <option key={c} value={c}>{t(`card.source.${c}`, c)}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>{t('card.labels.comment')}</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        {error && <div style={{ padding: 10, marginBottom: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
          <button type="button" onClick={onFullForm} disabled={saving}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', padding: 0, fontFamily: 'inherit' }}>
            {t('quick_lead.full_form')}
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}>
            {tCommon('cancel')}
          </button>
          <SubmitButton type="submit" loading={saving} loadingLabel={tCommon('save')}
            style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, opacity: saving ? 0.6 : 1 }}>
            {t('form.create_lead')}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  )
}
