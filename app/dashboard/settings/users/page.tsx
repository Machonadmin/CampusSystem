'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Role {
  id: string
  name: string
  code: string
  category: string
}

interface UserRow {
  account_id: string
  person_id: string
  full_name: string
  photo_url: string | null
  login_email: string
  is_active: boolean
  last_login: string | null
  created_at: string
  roles: { id: string; name: string; code: string }[]
}

type T = (key: string, fallback?: string) => string

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  if (photo) return <img src={photo} alt={name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{initials}</span>
    </div>
  )
}

function RoleBadge({ name }: { name: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, backgroundColor: 'var(--accent-tint)', color: 'var(--accent)', fontSize: 11, fontWeight: 500, marginRight: 4, marginBottom: 2 }}>
      {name}
    </span>
  )
}

interface RolesModalProps {
  user: UserRow
  allRoles: Role[]
  t: T
  tCat: T
  tCommon: T
  onClose: () => void
  onSaved: () => void
}

function RolesModal({ user, allRoles, t, tCat, tCommon, onClose, onSaved }: RolesModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(user.roles.map(r => r.id)))
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/settings/users/${user.account_id}/roles`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      // person_id required by API to target the correct person_roles rows
      body: JSON.stringify({ person_id: user.person_id, role_ids: [...selected] }),
    })
    setSaving(false)
    if (res.ok) { onSaved(); onClose() }
  }

  const grouped: Record<string, Role[]> = {}
  for (const r of allRoles) {
    if (!grouped[r.category]) grouped[r.category] = []
    grouped[r.category].push(r)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{t('roles_modal_title')}: {user.full_name}</p>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 20px', flex: 1 }}>
          {Object.entries(grouped).map(([cat, roles]) => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{tCat(cat, cat)}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {roles.map(r => (
                  <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={e => {
                        const next = new Set(selected)
                        if (e.target.checked) next.add(r.id); else next.delete(r.id)
                        setSelected(next)
                      }}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{r.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>{tCommon('cancel')}</button>
          <button onClick={save} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{tCommon('save', 'Save')}</button>
        </div>
      </div>
    </div>
  )
}

interface AddUserModalProps {
  allRoles: Role[]
  t: T
  tCat: T
  tCommon: T
  onClose: () => void
  onSaved: () => void
}

interface PersonResult { id: string; full_name: string; email: string | null }

function AddUserModal({ allRoles, t, tCat, tCommon, onClose, onSaved }: AddUserModalProps) {
  // Person search
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PersonResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null)
  const [createNew, setCreateNew] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Form fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [autoGen, setAutoGen] = useState(true)
  const [roleIds, setRoleIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function handleSearch(q: string) {
    setQuery(q)
    setSelectedPerson(null)
    setCreateNew(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (q.length < 2) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      const res = await fetch(`/api/settings/persons/search?q=${encodeURIComponent(q)}`)
      if (res.ok) setResults(await res.json())
      setSearching(false)
    }, 300)
  }

  function selectPerson(p: PersonResult) {
    setSelectedPerson(p)
    setCreateNew(false)
    setQuery('')
    setResults([])
    if (p.email && !email) setEmail(p.email)
  }

  function clearSelection() {
    setSelectedPerson(null)
    setCreateNew(false)
    setQuery('')
    setResults([])
  }

  async function save() {
    if (!email) { setErr(t('err_email_password_required')); return }
    if (!autoGen && (!password || password.length < 8)) { setErr(t('err_password_min')); return }
    if (!selectedPerson && !createNew) { setErr(t('err_select_person')); return }
    if (createNew && !fullName.trim()) { setErr(t('err_enter_name')); return }

    setSaving(true); setErr('')
    const base = selectedPerson
      ? { person_id: selectedPerson.id }
      : { full_name: fullName.trim() }
    const body = {
      ...base,
      login_email: email,
      role_ids: roleIds,
      ...(autoGen ? { generate_password: true } : { password }),
    }

    const res = await fetch('/api/settings/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) {
      onSaved()
      if (data.generated_password) setGeneratedPassword(data.generated_password) // показать пароль, не закрывая
      else onClose()
    } else setErr(data.error ?? tCommon('error'))
  }

  const toggleRole = (id: string) =>
    setRoleIds(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id])

  const grouped: Record<string, Role[]> = {}
  for (const r of allRoles) {
    if (!grouped[r.category]) grouped[r.category] = []
    grouped[r.category].push(r)
  }

  const personChosen = !!selectedPerson || createNew

  async function copyPassword() {
    if (!generatedPassword) return
    try { await navigator.clipboard.writeText(generatedPassword); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  // После создания с авто-паролем — показываем пароль (один раз).
  if (generatedPassword) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'grid', gap: 14 }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', margin: 0 }}>{t('generated_password_title')}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: 18, fontWeight: 700, letterSpacing: 1, color: 'var(--text)', background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', userSelect: 'all', textAlign: 'center' }}>{generatedPassword}</code>
            <button onClick={copyPassword} style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: copied ? '#059669' : 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {copied ? t('copied') : t('copy_password')}
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{t('generated_password_hint')}</p>
          <button onClick={onClose} style={{ justifySelf: 'end', padding: '8px 20px', borderRadius: 8, backgroundColor: 'var(--text)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('done')}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{t('add_modal_title')}</p>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* ── Step 1: person search — outside overflowY container so dropdown isn't clipped ── */}
        <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
          {err && <p style={{ color: '#DC2626', fontSize: 12, margin: '0 0 10px' }}>{err}</p>}

          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
            {t('search_existing_person_hint')}
          </p>

          {selectedPerson && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: '1px solid #4BAED4', backgroundColor: '#F0F9FF' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{selectedPerson.full_name}</p>
                {selectedPerson.email && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{selectedPerson.email}</p>}
              </div>
              <button onClick={clearSelection} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          )}

          {createNew && !selectedPerson && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', backgroundColor: 'var(--surface-2)' }}>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{t('new_person_badge')}</p>
              <button onClick={clearSelection} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
          )}

          {!personChosen && (
            <div style={{ position: 'relative' }}>
              <input
                value={query}
                onChange={e => handleSearch(e.target.value)}
                placeholder={t('search_name_email_placeholder')}
                autoComplete="off"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
              {(results.length > 0 || searching || query.length >= 2) && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: 4, overflow: 'hidden' }}>
                  {searching && (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-faint)' }}>{t('searching')}</div>
                  )}
                  {!searching && results.map(p => (
                    <div
                      key={p.id}
                      onClick={() => selectPerson(p)}
                      style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--surface-2)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--surface-2)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '' }}
                    >
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{p.full_name}</p>
                      {p.email && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{p.email}</p>}
                    </div>
                  ))}
                  {!searching && (
                    <div
                      onClick={() => { setCreateNew(true); setResults([]); setQuery('') }}
                      style={{ padding: '10px 12px', cursor: 'pointer', color: 'var(--accent)', fontSize: 13, fontWeight: 500, borderTop: results.length > 0 ? '1px solid var(--border)' : 'none' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#F0F4FF' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '' }}
                    >
                      {t('create_new_person_link')}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Steps 2-4: scrollable area ── */}
        <div style={{ overflowY: 'auto', padding: '14px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {createNew && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{t('full_name')} *</span>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13, outline: 'none' }}
              />
            </label>
          )}

          {personChosen && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>Email *</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13, outline: 'none' }}
                />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={autoGen} onChange={e => setAutoGen(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{t('auto_generate')}</span>
                </label>
                {!autoGen && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{t('password_label')} *</span>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={t('password_hint_placeholder')}
                      autoComplete="new-password"
                      style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13, outline: 'none' }}
                    />
                  </label>
                )}
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 8 }}>{t('select_roles_title')}</p>
                {Object.entries(grouped).map(([cat, roles]) => (
                  <div key={cat} style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{tCat(cat, cat)}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {roles.map(r => (
                        <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                          <input type="checkbox" checked={roleIds.includes(r.id)} onChange={() => toggleRole(r.id)} style={{ accentColor: 'var(--accent)' }} />
                          <span style={{ fontSize: 13, color: 'var(--text)' }}>{r.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>{tCommon('cancel')}</button>
          <button
            onClick={save}
            disabled={saving || !personChosen}
            style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, cursor: (saving || !personChosen) ? 'not-allowed' : 'pointer', opacity: (saving || !personChosen) ? 0.5 : 1 }}
          >
            {tCommon('save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reset-password modal ─────────────────────────────────────────────────────

interface ResetPasswordModalProps {
  user: UserRow
  t: T
  tCommon: T
  onClose: () => void
}

function ResetPasswordModal({ user, t, tCommon, onClose }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [autoGen, setAutoGen] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function save() {
    if (!autoGen) {
      if (password.length < 8) { setErr(t('err_password_min')); return }
      if (password !== confirm) { setErr(t('password_mismatch')); return }
    }
    setSaving(true); setErr('')
    const res = await fetch(`/api/settings/users/${user.account_id}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(autoGen ? { generate_password: true } : { password }),
    })
    setSaving(false)
    if (res.ok) {
      const d = await res.json().catch(() => ({}))
      if (d.generated_password) setGeneratedPassword(d.generated_password)
      else onClose()
    } else { const d = await res.json(); setErr(d.error ?? tCommon('error')) }
  }

  async function copyPassword() {
    if (!generatedPassword) return
    try { await navigator.clipboard.writeText(generatedPassword); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }

  if (generatedPassword) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'grid', gap: 14 }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', margin: 0 }}>{t('password_reset_done')}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: 18, fontWeight: 700, letterSpacing: 1, color: 'var(--text)', background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px', userSelect: 'all', textAlign: 'center' }}>{generatedPassword}</code>
            <button onClick={copyPassword} style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: copied ? '#059669' : 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {copied ? t('copied') : t('copy_password')}
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{t('generated_password_hint')}</p>
          <button onClick={onClose} style={{ justifySelf: 'end', padding: '8px 20px', borderRadius: 8, backgroundColor: 'var(--text)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t('done')}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{t('reset_password_modal_title')}: {user.full_name}</p>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <p style={{ color: '#DC2626', fontSize: 12, margin: 0 }}>{err}</p>}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={autoGen} onChange={e => setAutoGen(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{t('auto_generate')}</span>
          </label>
          {!autoGen && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{t('new_password_label')} *</span>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('password_hint_placeholder')}
                  autoComplete="new-password"
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13, outline: 'none' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{t('confirm_password_label')} *</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder={t('confirm_password_placeholder')}
                  autoComplete="new-password"
                  style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${confirm && confirm !== password ? '#FCA5A5' : 'var(--border-strong)'}`, fontSize: 13, outline: 'none' }}
                />
              </label>
            </>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>{tCommon('cancel')}</button>
          <button onClick={save} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: '#DC2626', color: '#fff', border: 'none', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{t('reset_password_button')}</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit-user modal ───────────────────────────────────────────────────────────

interface EditUserModalProps {
  user: UserRow
  t: T
  tCommon: T
  onClose: () => void
  onSaved: () => void
}

function EditUserModal({ user, t, tCommon, onClose, onSaved }: EditUserModalProps) {
  const [fullName, setFullName] = useState(user.full_name)
  const [email, setEmail] = useState(user.login_email)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [pwdOpen, setPwdOpen] = useState(false)

  async function save() {
    if (!fullName.trim() || !email.trim()) { setErr(t('err_fields_empty')); return }
    setSaving(true); setErr('')
    const res = await fetch(`/api/settings/users/${user.account_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName.trim(), login_email: email.trim() }),
    })
    setSaving(false)
    if (res.ok) { onSaved(); onClose() }
    else { const d = await res.json(); setErr(d.error ?? tCommon('error')) }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{t('edit_modal_title')}</p>
            <button onClick={onClose} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {err && <p style={{ color: '#DC2626', fontSize: 12, margin: 0 }}>{err}</p>}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{t('full_name')}</span>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13, outline: 'none' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>Email</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', fontSize: 13, outline: 'none' }}
              />
            </label>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => setPwdOpen(true)}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', fontSize: 12, cursor: 'pointer', color: '#DC2626' }}
            >
              {t('reset_password_button')}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>{tCommon('cancel')}</button>
              <button onClick={save} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{tCommon('save', 'Save')}</button>
            </div>
          </div>
        </div>
      </div>

      {pwdOpen && <ResetPasswordModal user={user} t={t} tCommon={tCommon} onClose={() => setPwdOpen(false)} />}
    </>
  )
}

export default function UsersPage() {
  const t = useTranslations('settings.users')
  const tCat = useTranslations('settings.categories')
  const tCommon = useTranslations('common')
  const tNav = useTranslations('navigation')

  const [users, setUsers] = useState<UserRow[]>([])
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [rolesTarget, setRolesTarget] = useState<UserRow | null>(null)
  const [editTarget, setEditTarget] = useState<UserRow | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [usersRes, rolesRes] = await Promise.all([
      fetch('/api/settings/users'),
      fetch('/api/settings/roles'),
    ])
    if (!usersRes.ok || !rolesRes.ok) { setError(tCommon('error')); setLoading(false); return }
    const [usersData, rolesData] = await Promise.all([usersRes.json(), rolesRes.json()])
    setUsers(usersData)
    setAllRoles(rolesData)
    setLoading(false)
  }, [tCommon])

  useEffect(() => { load() }, [load])

  async function toggleActive(user: UserRow) {
    await fetch(`/api/settings/users/${user.account_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !user.is_active }),
    })
    load()
  }

  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.login_email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-5">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('settings'), href: '/dashboard/settings' },
        { label: t('title') },
      ]} />

      <div
        className="flex items-center rounded-xl overflow-hidden"
        style={{ backgroundColor: '#4BAED4', borderLeft: '4px solid rgba(255,255,255,0.35)', padding: '12px 24px' }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--text-faint)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('search_placeholder')}
            style={{ width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 8, paddingBottom: 8, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, backgroundColor: 'var(--surface-2)', outline: 'none' }}
          />
        </div>
        <button
          onClick={() => setAddOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('create_button')}
        </button>
      </div>

      <div style={{ backgroundColor: 'var(--surface)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{tCommon('loading')}</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#DC2626', fontSize: 13 }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('no_users')}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {[t('full_name'), t('email'), t('table_roles'), t('table_status'), t('table_last_login'), t('table_actions')].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <tr key={user.account_id} style={{ borderBottom: '1px solid var(--surface-2)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'var(--surface-2)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '' }}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={user.full_name} photo={user.photo_url} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{user.full_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>{user.login_email}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: 260 }}>
                      {user.roles.slice(0, 3).map(r => <RoleBadge key={r.id} name={r.name} />)}
                      {user.roles.length > 3 && <span style={{ fontSize: 11, color: 'var(--text-faint)', alignSelf: 'center' }}>+{user.roles.length - 3}</span>}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                      backgroundColor: user.is_active ? '#D1FAE5' : '#FEE2E2',
                      color: user.is_active ? '#065F46' : '#991B1B',
                    }}>
                      {user.is_active ? t('active') : t('inactive')}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : t('never')}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setEditTarget(user)}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, cursor: 'pointer', color: 'var(--text)' }}
                      >
                        {t('edit_button')}
                      </button>
                      <button
                        onClick={() => setRolesTarget(user)}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, cursor: 'pointer', color: 'var(--text)' }}
                      >
                        {t('manage_roles_button')}
                      </button>
                      {!user.roles.some(r => r.code === 'superadmin') && (
                        <button
                          onClick={() => toggleActive(user)}
                          style={{
                            padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 12, cursor: 'pointer',
                            backgroundColor: user.is_active ? '#FEF2F2' : '#F0FDF4',
                            color: user.is_active ? '#DC2626' : '#16A34A',
                          }}
                        >
                          {user.is_active ? t('deactivate_button') : t('activate_button')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editTarget && (
        <EditUserModal user={editTarget} t={t} tCommon={tCommon} onClose={() => setEditTarget(null)} onSaved={load} />
      )}
      {rolesTarget && (
        <RolesModal user={rolesTarget} allRoles={allRoles} t={t} tCat={tCat} tCommon={tCommon} onClose={() => setRolesTarget(null)} onSaved={load} />
      )}
      {addOpen && (
        <AddUserModal allRoles={allRoles} t={t} tCat={tCat} tCommon={tCommon} onClose={() => setAddOpen(false)} onSaved={load} />
      )}
    </div>
  )
}
