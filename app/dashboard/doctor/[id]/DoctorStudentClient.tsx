'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Profile {
  blood_type: string | null
  chronic_conditions: string | null
  allergies: string | null
  medications: string | null
  emergency_contact: string | null
  notes: string | null
}
interface Visit {
  id: string
  visit_date: string
  reason: string | null
  diagnosis: string | null
  treatment: string | null
  follow_up_date: string | null
  status: 'open' | 'closed'
  notes: string | null
}

const EMPTY_PROFILE: Profile = {
  blood_type: '', chronic_conditions: '', allergies: '',
  medications: '', emergency_contact: '', notes: '',
}

interface Props {
  journeyId: string
  studentName: string
  canManage: boolean
}

export default function DoctorStudentClient({ journeyId, studentName, canManage }: Props) {
  const t = useTranslations('doctor')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('doctor', 'primary')
  const light = getModuleColor('doctor', 'light')

  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE)
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)

  // record-visit form
  const [busy, setBusy] = useState(false)
  const [visitError, setVisitError] = useState<string | null>(null)
  const [vDate, setVDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [vReason, setVReason] = useState('')
  const [vDiagnosis, setVDiagnosis] = useState('')
  const [vTreatment, setVTreatment] = useState('')
  const [vFollowUp, setVFollowUp] = useState('')
  const [vNotes, setVNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/doctor/journeys/${journeyId}`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('visit.load_error')); return
      }
      const b = await res.json()
      if (b.profile) {
        setProfile({
          blood_type: b.profile.blood_type ?? '',
          chronic_conditions: b.profile.chronic_conditions ?? '',
          allergies: b.profile.allergies ?? '',
          medications: b.profile.medications ?? '',
          emergency_contact: b.profile.emergency_contact ?? '',
          notes: b.profile.notes ?? '',
        })
      } else {
        setProfile(EMPTY_PROFILE)
      }
      setVisits(b.visits ?? [])
    } catch {
      setError(t('visit.load_error'))
    } finally {
      setLoading(false)
    }
  }, [journeyId, t])

  useEffect(() => { load() }, [load])

  async function saveProfile() {
    setSavingProfile(true); setProfileError(null); setProfileSaved(false)
    try {
      const res = await fetch(`/api/doctor/journeys/${journeyId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setProfileError(b.error ?? t('profile.save_error')); return
      }
      setProfileSaved(true)
    } catch {
      setProfileError(t('profile.save_error'))
    } finally {
      setSavingProfile(false)
    }
  }

  async function recordVisit() {
    if (!vDate) { setVisitError(t('visit.required')); return }
    setBusy(true); setVisitError(null)
    try {
      const res = await fetch(`/api/doctor/journeys/${journeyId}/visits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit_date: vDate,
          reason: vReason || null,
          diagnosis: vDiagnosis || null,
          treatment: vTreatment || null,
          follow_up_date: vFollowUp || null,
          notes: vNotes || null,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setVisitError(b.error ?? t('visit.record_error')); return
      }
      setVReason(''); setVDiagnosis(''); setVTreatment(''); setVFollowUp(''); setVNotes('')
      await load()
    } catch {
      setVisitError(t('visit.record_error'))
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(v: Visit, status: 'open' | 'closed') {
    const confirmMsg = status === 'closed' ? t('visit.close_confirm') : t('visit.reopen_confirm')
    if (!confirm(confirmMsg)) return
    setBusy(true); setVisitError(null)
    try {
      const res = await fetch(`/api/doctor/visits/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setVisitError(b.error ?? t('visit.action_error')); return
      }
      await load()
    } catch {
      setVisitError(t('visit.action_error'))
    } finally {
      setBusy(false)
    }
  }

  function setField(key: keyof Profile, value: string) {
    setProfile(p => ({ ...p, [key]: value }))
    setProfileSaved(false)
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title'), href: '/dashboard/doctor' },
        { label: studentName },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('doctor'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(5,150,105,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{studentName}</h1>
        <Link href="/dashboard/doctor" style={{ fontSize: 13, color: '#fff', opacity: 0.9, textDecoration: 'underline' }}>
          {tCommon('back')}
        </Link>
      </div>

      {error && <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>}
      {loading ? (
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{tCommon('loading')}</div>
      ) : (
        <>
          {/* Medical profile */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>{t('profile.title')}</h2>
            {profileError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{profileError}</div>}
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <Field label={t('profile.blood_type')}>
                <input value={profile.blood_type ?? ''} onChange={e => setField('blood_type', e.target.value)} disabled={!canManage} style={inp} />
              </Field>
              <Field label={t('profile.emergency_contact')}>
                <input value={profile.emergency_contact ?? ''} onChange={e => setField('emergency_contact', e.target.value)} disabled={!canManage} style={inp} />
              </Field>
              <Field label={t('profile.allergies')} full>
                <textarea value={profile.allergies ?? ''} onChange={e => setField('allergies', e.target.value)} disabled={!canManage} rows={2} style={area} />
              </Field>
              <Field label={t('profile.chronic_conditions')} full>
                <textarea value={profile.chronic_conditions ?? ''} onChange={e => setField('chronic_conditions', e.target.value)} disabled={!canManage} rows={2} style={area} />
              </Field>
              <Field label={t('profile.medications')} full>
                <textarea value={profile.medications ?? ''} onChange={e => setField('medications', e.target.value)} disabled={!canManage} rows={2} style={area} />
              </Field>
              <Field label={t('profile.notes')} full>
                <textarea value={profile.notes ?? ''} onChange={e => setField('notes', e.target.value)} disabled={!canManage} rows={2} style={area} />
              </Field>
            </div>
            {canManage && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={saveProfile} disabled={savingProfile} style={btn(primary)}>{tCommon('save')}</button>
                {profileSaved && <span style={{ fontSize: 12, color: primary }}>{t('profile.saved')}</span>}
              </div>
            )}
          </div>

          {/* Record visit */}
          {canManage && (
            <div style={{ background: '#fff', border: `1px solid ${primary}`, borderRadius: 12, padding: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>{t('visit.record_title')}</h2>
              {visitError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{visitError}</div>}
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <Field label={t('visit.visit_date')}>
                  <input type="date" value={vDate} onChange={e => setVDate(e.target.value)} style={inp} />
                </Field>
                <Field label={t('visit.follow_up_date')}>
                  <input type="date" value={vFollowUp} onChange={e => setVFollowUp(e.target.value)} style={inp} />
                </Field>
                <Field label={t('visit.reason')} full>
                  <input value={vReason} onChange={e => setVReason(e.target.value)} style={inp} />
                </Field>
                <Field label={t('visit.diagnosis')} full>
                  <textarea value={vDiagnosis} onChange={e => setVDiagnosis(e.target.value)} rows={2} style={area} />
                </Field>
                <Field label={t('visit.treatment')} full>
                  <textarea value={vTreatment} onChange={e => setVTreatment(e.target.value)} rows={2} style={area} />
                </Field>
                <Field label={t('visit.notes')} full>
                  <textarea value={vNotes} onChange={e => setVNotes(e.target.value)} rows={2} style={area} />
                </Field>
              </div>
              <div style={{ marginTop: 12 }}>
                <button onClick={recordVisit} disabled={busy} style={btn(primary)}>{t('visit.record')}</button>
              </div>
            </div>
          )}

          {/* Visit history */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>{t('visit.history_title')}</h2>
            {visits.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('visit.no_visits')}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {[t('visit.visit_date'), t('visit.reason'), t('visit.diagnosis'), t('visit.follow_up_date'), t('visit.status'), ''].map((h, i) => (
                        <th key={i} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map(v => (
                      <tr key={v.id}>
                        <td style={td}>{v.visit_date}</td>
                        <td style={td}>{v.reason || '—'}</td>
                        <td style={td}>{v.diagnosis || '—'}</td>
                        <td style={td}>{v.follow_up_date || '—'}</td>
                        <td style={td}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
                            background: v.status === 'open' ? light : '#F3F4F6',
                            color: v.status === 'open' ? '#047857' : '#6B7280',
                          }}>
                            {t(`status.${v.status}`)}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {canManage && v.status === 'open' && (
                            <button onClick={() => setStatus(v, 'closed')} disabled={busy} style={linkBtn(primary)}>{t('visit.close')}</button>
                          )}
                          {canManage && v.status === 'closed' && (
                            <button onClick={() => setStatus(v, 'open')} disabled={busy} style={linkBtn('#6B7280')}>{t('visit.reopen')}</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'grid', gap: 4, gridColumn: full ? '1 / -1' : undefined }}>
      {label}
      {children}
    </label>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9CA3AF',
  textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px',
  borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { fontSize: 13, color: '#1F2937', padding: '9px 12px', borderBottom: '1px solid #F3F4F6' }
const inp: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937', width: '100%' }
const area: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937', resize: 'vertical', fontFamily: 'inherit', width: '100%' }

function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}
function linkBtn(color: string): React.CSSProperties {
  return { background: 'none', border: 'none', color, cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '2px 6px' }
}
