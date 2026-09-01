'use client'

import { useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { CitySelect } from '@/components/ui/city-select'
import { CountrySelect } from '@/components/ui/country-select'
import { CommunityRoleSelect } from '@/components/education/CommunityRoleSelect'

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
  // journeyId нового лида — чтобы вызывающий сразу открыл его карточку
  // (секретарь обычно прямо сейчас говорит с ним по телефону).
  onSaved: (journeyId?: string) => void
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
  // Источник «община» → компактный блок общины: кто прислал лида и в какой
  // роли (список ролей утверждён владельцем — CommunityRoleSelect).
  const [commCountry, setCommCountry] = useState('')
  const [commCity, setCommCity] = useState('')
  const [commName, setCommName] = useState('')
  const [repName, setRepName] = useState('')
  const [repRole, setRepRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCommunity = source === 'event_community'
  const communityTouched = !!(commName.trim() || repName.trim() || repRole.trim() || commCity.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!lastName.trim()) { setError(t('form.required_last_name')); return }
    if (!firstName.trim()) { setError(t('form.required_first_name')); return }
    if (!phone.trim()) { setError(t('form.required_phone_short')); return }
    // Община сохраняется на сервере только с מדינה+עיר — не даём молча потерять.
    if (isCommunity && communityTouched) {
      if (!commCountry.trim()) { setError(t('communities.country_required')); return }
      if (!commCity.trim()) { setError(t('communities.city_required')); return }
    }
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
          communities: (isCommunity && communityTouched && commCountry.trim() && commCity.trim()) ? [{
            country: commCountry.trim(),
            city: commCity.trim(),
            name: commName.trim() || undefined,
            contact_person: repName.trim() || undefined,
            position: repRole.trim() || undefined,
          }] : undefined,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? tCommon('error'))
        setSaving(false)
        return
      }
      const b = await res.json().catch(() => ({}))
      onSaved(typeof b.journey_id === 'string' ? b.journey_id : undefined)
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
        <button type="button" onClick={onClose} aria-label={tCommon('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
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
        {isCommunity && (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>{t('form.community_country')}</label>
                <CountrySelect value={commCountry} onChange={ct => { setCommCountry(ct); setCommCity('') }} style={inp} />
              </div>
              <div>
                <label style={lbl}>{t('form.community_city')}</label>
                <CitySelect country={commCountry} value={commCity} onChange={setCommCity} disabled={!commCountry}
                  style={{ ...inp, ...(!commCountry ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }} />
              </div>
            </div>
            <div>
              <label style={lbl}>{t('form.community_name')}</label>
              <input value={commName} onChange={e => setCommName(e.target.value)} style={inp} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>{t('form.community_contact_person')}</label>
                <input value={repName} onChange={e => setRepName(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>{t('form.community_position')}</label>
                <CommunityRoleSelect value={repRole} onChange={setRepRole} ariaLabel={t('form.community_position')} style={inp} />
              </div>
            </div>
          </div>
        )}
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
