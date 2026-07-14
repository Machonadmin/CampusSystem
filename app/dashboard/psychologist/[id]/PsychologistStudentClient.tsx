'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Profile {
  presenting_concerns: string | null
  background: string | null
  risk_level: string
  referral_source: string | null
  notes: string | null
}
interface Session {
  id: string
  session_date: string
  session_type: 'intake' | 'followup' | 'crisis' | 'group' | 'other'
  summary: string | null
  follow_up_date: string | null
  status: 'open' | 'closed'
}

const EMPTY_PROFILE: Profile = {
  presenting_concerns: '', background: '', risk_level: 'none',
  referral_source: '', notes: '',
}

const RISK_LEVELS = ['none', 'low', 'medium', 'high'] as const
const SESSION_TYPES = ['intake', 'followup', 'crisis', 'group', 'other'] as const

interface Props {
  journeyId: string
  studentName: string
  canManage: boolean
}

export default function PsychologistStudentClient({ journeyId, studentName, canManage }: Props) {
  const t = useTranslations('psychologist')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('psychologist', 'primary')
  const light = getModuleColor('psychologist', 'light')

  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)

  // record-session form
  const [busy, setBusy] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [sDate, setSDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [sType, setSType] = useState<string>('followup')
  const [sSummary, setSSummary] = useState('')
  const [sFollowUp, setSFollowUp] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/psychologist/journeys/${journeyId}`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('session.load_error')); return
      }
      const b = await res.json()
      if (b.profile) {
        setProfile({
          presenting_concerns: b.profile.presenting_concerns ?? '',
          background: b.profile.background ?? '',
          risk_level: b.profile.risk_level ?? 'none',
          referral_source: b.profile.referral_source ?? '',
          notes: b.profile.notes ?? '',
        })
      } else {
        setProfile(EMPTY_PROFILE)
      }
      setSessions(b.sessions ?? [])
    } catch {
      setError(t('session.load_error'))
    } finally {
      setLoading(false)
    }
  }, [journeyId, t])

  useEffect(() => { load() }, [load])

  async function saveProfile() {
    setSavingProfile(true); setProfileError(null); setProfileSaved(false)
    try {
      const res = await fetch(`/api/psychologist/journeys/${journeyId}/profile`, {
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

  async function recordSession() {
    if (!sDate) { setSessionError(t('session.required')); return }
    setBusy(true); setSessionError(null)
    try {
      const res = await fetch(`/api/psychologist/journeys/${journeyId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_date: sDate,
          session_type: sType,
          summary: sSummary || null,
          follow_up_date: sFollowUp || null,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setSessionError(b.error ?? t('session.record_error')); return
      }
      setSType('followup'); setSSummary(''); setSFollowUp('')
      await load()
    } catch {
      setSessionError(t('session.record_error'))
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(s: Session, status: 'open' | 'closed') {
    const confirmMsg = status === 'closed' ? t('session.close_confirm') : t('session.reopen_confirm')
    if (!confirm(confirmMsg)) return
    setBusy(true); setSessionError(null)
    try {
      const res = await fetch(`/api/psychologist/sessions/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setSessionError(b.error ?? t('session.action_error')); return
      }
      await load()
    } catch {
      setSessionError(t('session.action_error'))
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
        { label: t('title'), href: '/dashboard/psychologist' },
        { label: studentName },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('psychologist'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(124,58,237,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{studentName}</h1>
        <Link href="/dashboard/psychologist" style={{ fontSize: 13, color: '#fff', opacity: 0.9, textDecoration: 'underline' }}>
          {tCommon('back')}
        </Link>
      </div>

      {error && <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>}
      {loading ? (
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{tCommon('loading')}</div>
      ) : (
        <>
          {/* Counseling profile */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>{t('profile.title')}</h2>
            {profileError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{profileError}</div>}
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <Field label={t('profile.risk_level')}>
                <select value={profile.risk_level ?? 'none'} onChange={e => setField('risk_level', e.target.value)} disabled={!canManage} style={inp}>
                  {RISK_LEVELS.map(r => (
                    <option key={r} value={r}>{t(`risk.${r}`)}</option>
                  ))}
                </select>
              </Field>
              <Field label={t('profile.referral_source')}>
                <input value={profile.referral_source ?? ''} onChange={e => setField('referral_source', e.target.value)} disabled={!canManage} style={inp} />
              </Field>
              <Field label={t('profile.presenting_concerns')} full>
                <textarea value={profile.presenting_concerns ?? ''} onChange={e => setField('presenting_concerns', e.target.value)} disabled={!canManage} rows={2} style={area} />
              </Field>
              <Field label={t('profile.background')} full>
                <textarea value={profile.background ?? ''} onChange={e => setField('background', e.target.value)} disabled={!canManage} rows={2} style={area} />
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

          {/* Record session */}
          {canManage && (
            <div style={{ background: '#fff', border: `1px solid ${primary}`, borderRadius: 12, padding: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>{t('session.record_title')}</h2>
              {sessionError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{sessionError}</div>}
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <Field label={t('session.session_date')}>
                  <input type="date" value={sDate} onChange={e => setSDate(e.target.value)} style={inp} />
                </Field>
                <Field label={t('session.session_type')}>
                  <select value={sType} onChange={e => setSType(e.target.value)} style={inp}>
                    {SESSION_TYPES.map(ty => (
                      <option key={ty} value={ty}>{t(`session.types.${ty}`)}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('session.follow_up_date')}>
                  <input type="date" value={sFollowUp} onChange={e => setSFollowUp(e.target.value)} style={inp} />
                </Field>
                <Field label={t('session.summary')} full>
                  <textarea value={sSummary} onChange={e => setSSummary(e.target.value)} rows={2} style={area} />
                </Field>
              </div>
              <div style={{ marginTop: 12 }}>
                <button onClick={recordSession} disabled={busy} style={btn(primary)}>{t('session.record')}</button>
              </div>
            </div>
          )}

          {/* Session history */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>{t('session.history_title')}</h2>
            {sessions.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('session.no_sessions')}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {[t('session.session_date'), t('session.session_type'), t('session.summary'), t('session.follow_up_date'), t('session.status'), ''].map((h, i) => (
                        <th key={i} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map(s => (
                      <tr key={s.id}>
                        <td style={td}>{s.session_date}</td>
                        <td style={td}>{t(`session.types.${s.session_type}`)}</td>
                        <td style={td}>{s.summary || '—'}</td>
                        <td style={td}>{s.follow_up_date || '—'}</td>
                        <td style={td}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
                            background: s.status === 'open' ? light : '#F3F4F6',
                            color: s.status === 'open' ? '#6D28D9' : '#6B7280',
                          }}>
                            {t(`status.${s.status}`)}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {canManage && s.status === 'open' && (
                            <button onClick={() => setStatus(s, 'closed')} disabled={busy} style={linkBtn(primary)}>{t('session.close')}</button>
                          )}
                          {canManage && s.status === 'closed' && (
                            <button onClick={() => setStatus(s, 'open')} disabled={busy} style={linkBtn('#6B7280')}>{t('session.reopen')}</button>
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
  textAlign: 'start', fontSize: 11, fontWeight: 600, color: '#9CA3AF',
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
