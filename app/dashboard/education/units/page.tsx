'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import PageActionButton from '@/components/ui/PageActionButton'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'

const GRANTABLE = [
  'view_students', 'manage_students', 'manage_enrollments', 'manage_class_groups',
  'manage_class_teachers', 'set_lesson_topics', 'mark_attendance', 'set_grades',
  'manage_study_groups', 'manage_subjects', 'manage_specialties', 'write_evaluation',
] as const

interface Unit { id: string; name: string }
interface Member {
  position_id: string
  person_id: string
  full_name: string
  hebrew_name: string | null
  email: string | null
  is_head: boolean
  role: 'studies_secretary' | 'teacher'
  privileges: Record<string, boolean>
}

export default function UnitTeamPage() {
  const t = useTranslations('education')
  const tNav = useTranslations('navigation')
  const accent = getModuleColor('education')

  const [units, setUnits] = useState<Unit[]>([])
  const [unitId, setUnitId] = useState<string>('')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    fetch('/api/education/units').then(r => r.ok ? r.json() : null).then(b => {
      const u = (b?.units ?? []) as Unit[]
      setUnits(u)
      if (u.length > 0) setUnitId(u[0].id)
    }).finally(() => setLoading(false))
  }, [])

  const loadMembers = useCallback(async (uid: string) => {
    if (!uid) { setMembers([]); return }
    const res = await fetch(`/api/education/units/${uid}/members`)
    if (res.ok) { const b = await res.json(); setMembers(b.members ?? []) }
  }, [])
  useEffect(() => { if (unitId) loadMembers(unitId) }, [unitId, loadMembers])

  async function togglePriv(personId: string, code: string, on: boolean) {
    setMembers(prev => prev.map(m => m.person_id === personId ? { ...m, privileges: { ...m.privileges, [code]: on } } : m))
    await fetch(`/api/education/units/${unitId}/members/${personId}/privileges`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ privileges: { [code]: on } }),
    })
  }

  async function removeMember(personId: string) {
    await fetch(`/api/education/units/${unitId}/members/${personId}`, { method: 'DELETE' })
    loadMembers(unitId)
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('units.title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '12px 24px' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{t('units.title')}</h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('units.subtitle')}</p>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>…</div>
      ) : units.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('units.no_units')}</div>
      ) : (
        <>
          {/* Toolbar: unit picker + add */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {units.length > 1 && (
              <select value={unitId} onChange={e => setUnitId(e.target.value)}
                style={{ padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }}>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            {units.length === 1 && <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{units[0].name}</span>}
            <div style={{ marginInlineStart: 'auto' }}>
              <PageActionButton label={t('units.add_member')} accentColor={accent} onClick={() => setAddOpen(true)} />
            </div>
          </div>

          {/* Members */}
          {members.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('units.empty')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {members.map(m => (
                <div key={m.position_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{m.full_name || m.hebrew_name || '—'}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: 'var(--accent-tint)', color: 'var(--accent-strong)' }}>
                      {m.is_head ? t('units.head_badge') : t(`units.role_${m.role === 'teacher' ? 'teacher' : 'secretary'}`)}
                    </span>
                    {m.email && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{m.email}</span>}
                    {!m.is_head && (
                      <button onClick={() => removeMember(m.person_id)}
                        style={{ marginInlineStart: 'auto', fontSize: 12, color: 'var(--danger)', background: 'transparent', border: '1px solid var(--danger-tint)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>
                        {t('units.remove')}
                      </button>
                    )}
                  </div>

                  {/* Permission toggles — heads have full access by role, so no toggles */}
                  {!m.is_head && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 10 }}>{t('units.perms_title')}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                        {GRANTABLE.map(code => {
                          const on = !!m.privileges[code]
                          return (
                            <label key={code} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--text)', cursor: 'pointer', padding: '6px 8px', borderRadius: 8, background: on ? 'var(--accent-tint)' : 'transparent' }}>
                              <input type="checkbox" checked={on} onChange={e => togglePriv(m.person_id, code, e.target.checked)}
                                style={{ accentColor: accent, width: 16, height: 16 }} />
                              {t(`units.priv.${code}`, code)}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {addOpen && unitId && (
        <AddMemberModal unitId={unitId} accent={accent}
          onClose={() => setAddOpen(false)}
          onDone={() => { setAddOpen(false); loadMembers(unitId) }} />
      )}
    </div>
  )
}

function AddMemberModal({ unitId, accent, onClose, onDone }: { unitId: string; accent: string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations('education')
  const [role, setRole] = useState<'studies_secretary' | 'teacher'>('studies_secretary')
  const [mode, setMode] = useState<'existing' | 'create'>('create')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [personId, setPersonId] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      const body = mode === 'create'
        ? { mode, role, first_name: firstName, last_name: lastName, email }
        : { mode, role, person_id: personId }
      const res = await fetch(`/api/education/units/${unitId}/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (res.ok) onDone()
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text)', outline: 'none' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: 'var(--shadow-lg)', padding: 20, display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{t('units.add_member')}</div>

        {/* role */}
        <div style={{ display: 'flex', gap: 8 }}>
          {(['studies_secretary', 'teacher'] as const).map(r => (
            <button key={r} onClick={() => setRole(r)} style={{ flex: 1, padding: '8px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${role === r ? accent : 'var(--border)'}`, background: role === r ? 'var(--accent-tint)' : 'var(--surface)', color: role === r ? 'var(--accent-strong)' : 'var(--text-muted)' }}>
              {t(`units.role_${r === 'teacher' ? 'teacher' : 'secretary'}`)}
            </button>
          ))}
        </div>

        {/* mode */}
        <div style={{ display: 'flex', gap: 8 }}>
          {(['create', 'existing'] as const).map(mo => (
            <button key={mo} onClick={() => setMode(mo)} style={{ flex: 1, padding: '7px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: `1px solid ${mode === mo ? accent : 'var(--border)'}`, background: mode === mo ? 'var(--accent-tint)' : 'var(--surface)', color: mode === mo ? 'var(--accent-strong)' : 'var(--text-muted)' }}>
              {t(`units.mode_${mo}`)}
            </button>
          ))}
        </div>

        {mode === 'create' ? (
          <>
            <input style={inp} placeholder={t('units.first_name')} value={firstName} onChange={e => setFirstName(e.target.value)} />
            <input style={inp} placeholder={t('units.last_name')} value={lastName} onChange={e => setLastName(e.target.value)} />
            <input style={inp} placeholder={t('units.email')} value={email} onChange={e => setEmail(e.target.value)} />
          </>
        ) : (
          <input style={inp} placeholder={t('units.person_id_ph')} value={personId} onChange={e => setPersonId(e.target.value)} />
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>{t('units.cancel')}</button>
          <button onClick={submit} disabled={saving || (mode === 'create' ? !firstName.trim() : !personId.trim())}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: accent, color: '#fff', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {t('units.create_btn')}
          </button>
        </div>
      </div>
    </div>
  )
}
