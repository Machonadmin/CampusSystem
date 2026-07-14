'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import SignatureCapture, { type SignatureMethod, type SignaturePayload } from '@/components/workflow/SignatureCapture'
import { useMe } from '@/lib/hooks/useMe'

interface ReferralOrigin {
  from_stage: string
  note: string | null
  signer_name: string | null
  completed_at: string | null
}
interface DocItem {
  id: string
  doc_type: string
  title: string
  file_name: string | null
  storage_path: string | null
  file_url: string | null
  created_at: string
}
interface MedicalProfile {
  blood_type: string | null
  chronic_conditions: string | null
  allergies: string | null
  medications: string | null
  emergency_contact: string | null
  notes: string | null
}
interface Applicant {
  person_id: string | null
  full_name: string
  hebrew_name: string | null
  email: string | null
  phones: string[]
  photo_url: string | null
  birth_date: string | null
  gender: string | null
  citizenship: string | null
}
interface Referral {
  stage_instance_id: string
  activated_at: string | null
  journey_id: string | null
  applicant: Applicant
  referrals: ReferralOrigin[]
  documents: DocItem[]
  medical_profile: MedicalProfile | null
  medical_visits: Array<{ id: string; visit_date: string; reason: string | null; diagnosis: string | null; status: string }>
}
interface Final {
  id: string
  code: string
  name_ru: string
  is_positive: boolean
  sort_order: number
}

/**
 * Очередь врача «Направленные к врачу» (מטופלות). Самодостаточный блок:
 * грузит /api/doctor/referrals и рендерит НИЧЕГО, если направлений нет.
 * Подписание идёт через общий /api/workflow/stages/.../complete (гейт по роли).
 */
export default function MedicalReferrals({ moduleKey = 'doctor' }: { moduleKey?: string }) {
  const t = useTranslations('doctor')
  const primary = getModuleColor(moduleKey, 'primary')
  const light = getModuleColor(moduleKey, 'light')

  const [referrals, setReferrals] = useState<Referral[]>([])
  const [finals, setFinals] = useState<Final[]>([])
  const [sigMethod, setSigMethod] = useState<SignatureMethod>('both')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/doctor/referrals')
      if (!res.ok) { setLoaded(true); return }
      const b = await res.json()
      setReferrals(b.referrals ?? [])
      setFinals(b.finals ?? [])
      setSigMethod((b.signature_method ?? 'both') as SignatureMethod)
    } catch { /* тихо — блок просто не покажется */ }
    finally { setLoaded(true) }
  }, [])

  useEffect(() => { load() }, [load])

  // Пока пусто — ничего не рендерим (чтобы страница врача выглядела чисто).
  if (!loaded || referrals.length === 0) return null

  return (
    <div style={{ background: '#fff', border: `1px solid ${primary}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>{t('referrals.title')}</h2>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: light, color: '#047857' }}>
          {referrals.length} · {t('referrals.count_badge')}
        </span>
      </div>
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 14 }}>{t('referrals.subtitle')}</div>

      <div style={{ display: 'grid', gap: 12 }}>
        {referrals.map(r => (
          <ReferralCard
            key={r.stage_instance_id}
            referral={r}
            finals={finals}
            sigMethod={sigMethod}
            moduleKey={moduleKey}
            onSigned={load}
          />
        ))}
      </div>
    </div>
  )
}

function ReferralCard({
  referral, finals, sigMethod, moduleKey, onSigned,
}: {
  referral: Referral
  finals: Final[]
  sigMethod: SignatureMethod
  moduleKey: string
  onSigned: () => void
}) {
  const t = useTranslations('doctor')
  const tCommon = useTranslations('common')
  const me = useMe()
  const primary = getModuleColor(moduleKey, 'primary')

  const [open, setOpen] = useState(false)
  const [selectedFinal, setSelectedFinal] = useState<string | null>(null)
  const [sig, setSig] = useState<SignaturePayload | null>(null)
  const [note, setNote] = useState('')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')

  const a = referral.applicant
  const name = a.full_name || a.hebrew_name || '—'

  function finalLabel(f: Final): string {
    if (f.code === 'approved') return t('referrals.final_approved')
    if (f.code === 'rejected') return t('referrals.final_rejected')
    return f.name_ru
  }

  async function openDoc(docId: string) {
    try {
      const res = await fetch(`/api/doctor/referrals/document/${docId}`)
      if (!res.ok) return
      const { url } = await res.json() as { url?: string }
      if (url) window.open(url, '_blank', 'noopener')
    } catch { /* игнор */ }
  }

  async function submit() {
    if (!selectedFinal) return
    setSigning(true)
    setError('')
    try {
      let signatureBody: Record<string, unknown> | undefined
      if (sig) {
        if (sig.kind === 'drawn' && sig.drawing_blob) {
          const fd = new FormData()
          fd.append('file', sig.drawing_blob, 'signature.png')
          const up = await fetch(`/api/workflow/stages/${referral.stage_instance_id}/signature/upload`, { method: 'POST', body: fd })
          if (!up.ok) {
            const d = await up.json().catch(() => ({})) as { error?: string }
            setError(d.error ?? t('referrals.sign_error')); return
          }
          const { storage_path } = await up.json() as { storage_path: string }
          signatureBody = { kind: 'drawn', drawing_path: storage_path }
        } else if (sig.kind === 'typed' && sig.typed_name) {
          signatureBody = { kind: 'typed', typed_name: sig.typed_name }
        }
      }

      const rd: Record<string, unknown> = {}
      if (signatureBody) rd.signature = signatureBody
      if (note.trim()) rd.note = note.trim()
      const body: Record<string, unknown> = { final_code: selectedFinal }
      if (Object.keys(rd).length) body.result_data = rd

      const res = await fetch(`/api/workflow/stages/${referral.stage_instance_id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? t('referrals.sign_error')); return
      }
      onSigned()
    } finally {
      setSigning(false)
    }
  }

  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
      {/* Заголовок карточки */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#F9FAFB' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: '#1F2937' }}>{name}</div>
          {referral.referrals.length > 0 && (
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
              {t('referrals.referred_by')}: {referral.referrals.map(x => x.from_stage).join(', ')}
            </div>
          )}
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: primary, border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {open ? t('referrals.hide') : t('referrals.open')}
        </button>
      </div>

      {open && (
        <div style={{ padding: 14, display: 'grid', gap: 16 }}>
          {/* Причина направления */}
          <Section title={t('referrals.reason')}>
            {referral.referrals.length === 0 ? (
              <div style={muted}>{t('referrals.no_reason')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {referral.referrals.map((x, i) => (
                  <div key={i} style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#92400E' }}>{x.from_stage}</div>
                    <div style={{ fontSize: 13, color: '#1F2937', marginTop: 2 }}>{x.note || t('referrals.no_reason')}</div>
                    {x.signer_name && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>— {x.signer_name}</div>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Личные данные */}
          <Section title={t('referrals.personal_details')}>
            <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {a.hebrew_name && <Field label={t('referrals.personal_details')} value={a.hebrew_name} />}
              {a.email && <Field label={t('referrals.email')} value={a.email} />}
              {a.phones.length > 0 && <Field label={t('referrals.phone')} value={a.phones.join(', ')} />}
              {a.birth_date && <Field label={t('referrals.birth_date')} value={a.birth_date} />}
              {a.gender && <Field label={t('referrals.gender')} value={a.gender} />}
              {a.citizenship && <Field label={t('referrals.citizenship')} value={a.citizenship} />}
            </div>
          </Section>

          {/* Документы */}
          <Section title={t('referrals.documents')}>
            {referral.documents.length === 0 ? (
              <div style={muted}>{t('referrals.no_documents')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {referral.documents.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ color: '#1F2937' }}>📄 {d.title || d.file_name || d.doc_type}</span>
                    {(d.storage_path || d.file_url) && (
                      <button onClick={() => openDoc(d.id)} style={{ fontSize: 12, fontWeight: 600, color: primary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        {t('referrals.download')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Рекорд рефёррал: прошлые медданные */}
          <Section title={t('referrals.medical_history')}>
            {!referral.medical_profile && referral.medical_visits.length === 0 ? (
              <div style={muted}>{t('referrals.no_medical_history')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 4 }}>
                {referral.medical_profile?.blood_type && <Field label={t('referrals.blood_type')} value={referral.medical_profile.blood_type} />}
                {referral.medical_profile?.allergies && <Field label={t('referrals.allergies')} value={referral.medical_profile.allergies} />}
                {referral.medical_profile?.chronic_conditions && <Field label={t('referrals.chronic')} value={referral.medical_profile.chronic_conditions} />}
                {referral.medical_profile?.medications && <Field label={t('referrals.medications')} value={referral.medical_profile.medications} />}
                {referral.medical_profile?.emergency_contact && <Field label={t('referrals.emergency_contact')} value={referral.medical_profile.emergency_contact} />}
                {referral.medical_visits.slice(0, 5).map(v => (
                  <div key={v.id} style={{ fontSize: 12, color: '#6B7280' }}>
                    {v.visit_date} · {v.reason || v.diagnosis || '—'}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Решение + подпись */}
          <Section title={t('referrals.decision')}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: selectedFinal ? 12 : 0 }}>
              {finals.map(f => (
                <button
                  key={f.id}
                  onClick={() => { setSelectedFinal(f.code); setSig(null); setError('') }}
                  style={{
                    fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${selectedFinal === f.code ? (f.is_positive ? '#059669' : '#DC2626') : '#D1D5DB'}`,
                    background: selectedFinal === f.code ? (f.is_positive ? '#ECFDF5' : '#FEF2F2') : '#fff',
                    color: selectedFinal === f.code ? (f.is_positive ? '#047857' : '#B91C1C') : '#374151',
                  }}
                >
                  {finalLabel(f)}
                </button>
              ))}
            </div>

            {selectedFinal && (
              <div style={{ display: 'grid', gap: 10, borderTop: '1px solid #F3F4F6', paddingTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{t('referrals.sign_title')}</div>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={`${tCommon('optional_note')} — ${tCommon('note_placeholder')}`}
                  rows={2}
                  style={{ fontSize: 13, padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 8, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                />
                <SignatureCapture method={sigMethod} defaultTypedName={me?.full_name ?? undefined} onChange={setSig} />
                {error && <div style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>}
                <button
                  onClick={submit}
                  disabled={signing || !sig}
                  style={{
                    justifySelf: 'start', fontSize: 13, fontWeight: 600, color: '#fff',
                    background: signing || !sig ? '#9CA3AF' : primary,
                    border: 'none', borderRadius: 8, padding: '9px 20px',
                    cursor: signing || !sig ? 'default' : 'pointer',
                  }}
                >
                  {signing ? t('referrals.signing') : t('referrals.confirm')}
                </button>
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 13 }}>
      <span style={{ color: '#9CA3AF' }}>{label}: </span>
      <span style={{ color: '#1F2937' }}>{value}</span>
    </div>
  )
}

const muted: React.CSSProperties = { fontSize: 13, color: '#9CA3AF' }
