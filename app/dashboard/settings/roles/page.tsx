'use client'

import { useEffect, useState, useCallback } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'

type T = (key: string, fallback?: string) => string

// ── Category display config ──────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  system:            '#FEF3C7',
  campus_management: '#EEF2FF',
  finance:           '#ECFDF5',
  legal:             '#F0F9FF',
  education:         '#F0FDF4',
  dormitory:         '#FFF7ED',
  medical:           '#FEE2E2',
  security:          '#F1F5F9',
  maintenance:       '#F8FAFC',
  food:              '#FFFBEB',
  technical:         '#F3F4F6',
  external:          '#FAF5FF',
}

const CAT_TEXT: Record<string, string> = {
  system:            '#92400E',
  campus_management: '#1E40AF',
  finance:           '#065F46',
  legal:             '#0369A1',
  education:         '#166534',
  dormitory:         '#9A3412',
  medical:           '#991B1B',
  security:          '#334155',
  maintenance:       '#475569',
  food:              '#78350F',
  technical:         '#4B5563',
  external:          '#6D28D9',
}

// ── Interfaces ───────────────────────────────────────────────────────────────
interface Role {
  id: string
  name: string
  code: string
  category: string
  description: string | null
  is_system: boolean
}

interface ModulePrivilege {
  id: string
  module: string
  privilege_code: string
  name: string
  sort_order: number
}

interface RolePrivilege {
  role_id: string
  module: string
  privilege_code: string
}

// ── AddRoleModal ─────────────────────────────────────────────────────────────
interface AddRoleModalProps {
  t: T
  tCommon: T
  onClose: () => void
  onSaved: (role: Role) => void
}

function AddRoleModal({ t, tCommon, onClose, onSaved }: AddRoleModalProps) {
  const [form, setForm] = useState({ name: '', code: '', category: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!form.name || !form.code || !form.category) { setErr(t('err_required_fields')); return }
    setSaving(true); setErr('')
    const res = await fetch('/api/settings/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) onSaved(data)
    else setErr(data.error ?? t('error', 'Error'))
  }

  const FIELDS: [string, string][] = [['name', t('name')], ['code', t('code')], ['category', t('category')], ['description', t('desc')]]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937' }}>{t('new_role_title')}</p>
          <button onClick={onClose} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <p style={{ color: '#DC2626', fontSize: 12, margin: 0 }}>{err}</p>}
          {FIELDS.map(([field, label]) => (
            <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{label}{field !== 'description' ? ' *' : ''}</span>
              <input
                value={(form as Record<string, string>)[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
              />
            </label>
          ))}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>{tCommon('cancel')}</button>
          <button onClick={save} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: '#3B82F6', color: '#fff', border: 'none', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{tCommon('save')}</button>
        </div>
      </div>
    </div>
  )
}

// ── AddPrivilegeModal ────────────────────────────────────────────────────────
interface AddPrivilegeModalProps {
  module: string
  t: T
  tCommon: T
  onClose: () => void
  onAdd: (module: string, name: string, code: string) => void
}

function AddPrivilegeModal({ module, t, tCommon, onClose, onAdd }: AddPrivilegeModalProps) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')

  function submit() {
    if (!name.trim() || !code.trim()) { setErr(t('err_both_fields')); return }
    onAdd(module, name.trim(), code.trim())
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: '#1F2937', margin: 0 }}>{t('add_privilege_title')}: <span style={{ color: '#3B82F6' }}>{module}</span></p>
          <button onClick={onClose} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <p style={{ color: '#DC2626', fontSize: 12, margin: 0 }}>{err}</p>}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t('priv_name_label')} *</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('priv_name_placeholder')}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t('priv_code_label')} *</span>
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder={`${module}.view`}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none', fontFamily: 'monospace' }}
            />
          </label>
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>{tCommon('cancel')}</button>
          <button onClick={submit} style={{ padding: '6px 14px', borderRadius: 8, backgroundColor: '#3B82F6', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>{t('add_privilege_button')}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function RolesPage() {
  const { t: tModules } = useLang()
  const t = useTranslations('settings.roles')
  const tCat = useTranslations('settings.categories')
  const tCommon = useTranslations('common')
  const tNav = useTranslations('navigation')

  const ALL_MODULES = (
    ['persons', 'education', 'finance', 'dormitory', 'food', 'security', 'alumni', 'sponsors',
      'tasks', 'documents', 'reports', 'contacts', 'settings', 'doctor', 'psychologist', 'maintenance'] as const
  ).map(code => ({ code, name: tModules.nav[code] ?? code }))

  function catLabel(cat: string): string {
    return tCat(cat, cat)
  }

  const [roles, setRoles] = useState<Role[]>([])
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [modulePrivs, setModulePrivs] = useState<ModulePrivilege[]>([])
  const [rolePrivs, setRolePrivs] = useState<Set<string>>(new Set())
  const [loadingPrivs, setLoadingPrivs] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [addPrivModule, setAddPrivModule] = useState<string | null>(null)

  const loadRoles = useCallback(async () => {
    const res = await fetch('/api/settings/roles')
    if (res.ok) setRoles(await res.json())
  }, [])

  useEffect(() => { loadRoles() }, [loadRoles])

  async function selectRole(role: Role) {
    setSelectedRole(role)
    setLoadingPrivs(true)
    const res = await fetch(`/api/settings/role-privileges?role_id=${role.id}`)
    if (res.ok) {
      const data = await res.json()
      setModulePrivs(data.modulePrivileges ?? [])
      const grantedKeys = new Set<string>((data.rolePrivileges ?? []).map((p: RolePrivilege) => `${p.module}::${p.privilege_code}`))
      setRolePrivs(grantedKeys)
    }
    setLoadingPrivs(false)
  }

  function togglePriv(module: string, code: string) {
    const key = `${module}::${code}`
    setRolePrivs(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function savePrivileges() {
    if (!selectedRole) return
    setSaving(true)
    const privileges = [...rolePrivs].map(key => {
      const [module, privilege_code] = key.split('::')
      return { module, privilege_code }
    })
    await fetch('/api/settings/role-privileges', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: selectedRole.id, privileges }),
    })
    setSaving(false)
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2000)
  }

  async function deleteRole(role: Role) {
    if (!confirm(t('confirm_delete'))) return
    const res = await fetch(`/api/settings/roles/${role.id}`, { method: 'DELETE' })
    if (res.ok) {
      if (selectedRole?.id === role.id) { setSelectedRole(null); setRolePrivs(new Set()); setModulePrivs([]) }
      loadRoles()
    }
  }

  function handleAddPrivilege(module: string, name: string, code: string) {
    // Add to local catalogue so it appears in the grid
    setModulePrivs(prev => [
      ...prev,
      { id: `local-${module}-${code}`, module, privilege_code: code, name, sort_order: 999 },
    ])
    // Auto-check it for the current role
    setRolePrivs(prev => new Set([...prev, `${module}::${code}`]))
  }

  const grouped: Record<string, ModulePrivilege[]> = {}
  for (const mp of modulePrivs) {
    if (!grouped[mp.module]) grouped[mp.module] = []
    grouped[mp.module].push(mp)
  }

  const groupedRoles: Record<string, Role[]> = {}
  for (const r of roles) {
    if (!groupedRoles[r.category]) groupedRoles[r.category] = []
    groupedRoles[r.category].push(r)
  }

  return (
    <div className="p-6" style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('settings'), href: '/dashboard/settings' },
        { label: t('title') },
      ]} />

      {/* Banner */}
      <div
        style={{ backgroundColor: '#4BAED4', borderLeft: '4px solid rgba(255,255,255,0.35)', padding: '12px 24px', borderRadius: 12, flexShrink: 0 }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', margin: 0 }}>{t('title')}</h1>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>

        {/* ── Left panel: roles list ── */}
        <div style={{ width: 268, flexShrink: 0, backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{t('roles_panel_title')}</span>
            <button
              onClick={() => setAddOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', backgroundColor: '#3B82F6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
            >
              <svg style={{ width: 11, height: 11 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('add_role_button')}
            </button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {Object.entries(groupedRoles).map(([cat, catRoles]) => {
              const catBg = CAT_COLORS[cat] ?? '#F3F4F6'
              const catTxt = CAT_TEXT[cat] ?? '#4B5563'
              return (
                <div key={cat}>
                  {/* Category header */}
                  <div style={{
                    padding: '8px 12px',
                    backgroundColor: catBg,
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    borderTop: '1px solid rgba(0,0,0,0.05)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: catTxt, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {catLabel(cat)}
                    </span>
                  </div>
                  {catRoles.map(role => {
                    const isActive = selectedRole?.id === role.id
                    return (
                      <div
                        key={role.id}
                        onClick={() => selectRole(role)}
                        style={{
                          padding: '8px 12px 8px 20px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: isActive ? '#EEF2FF' : 'transparent',
                          borderLeft: `2px solid ${isActive ? '#3B82F6' : 'transparent'}`,
                          transition: 'background-color 0.1s, border-left-color 0.1s',
                        }}
                        onMouseEnter={e => {
                          if (!isActive) {
                            const el = e.currentTarget as HTMLDivElement
                            el.style.backgroundColor = '#F5F7FF'
                            el.style.borderLeftColor = '#4BAED4'
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isActive) {
                            const el = e.currentTarget as HTMLDivElement
                            el.style.backgroundColor = 'transparent'
                            el.style.borderLeftColor = 'transparent'
                          }
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 500, color: '#1F2937', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role.name}</p>
                          <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0, fontFamily: 'monospace' }}>{role.code}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 6 }}>
                          {role.is_system && (
                            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, backgroundColor: catBg, color: catTxt, fontWeight: 600, border: `1px solid ${catTxt}22` }}>
                              {t('is_system')}
                            </span>
                          )}
                          {!role.is_system && (
                            <button
                              onClick={e => { e.stopPropagation(); deleteRole(role) }}
                              style={{ padding: '2px 7px', borderRadius: 6, border: 'none', backgroundColor: '#FEF2F2', color: '#DC2626', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right panel: privileges ── */}
        <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedRole ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 13 }}>
              {t('select_role_hint')}
            </div>
          ) : (
            <>
              {/* Right header */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1F2937', margin: 0 }}>{selectedRole.name}</p>
                  {selectedRole.description && <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0 0' }}>{selectedRole.description}</p>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {savedMsg && <span style={{ fontSize: 12, color: '#16A34A' }}>✓ {t('saved_label')}</span>}
                  <button
                    onClick={savePrivileges}
                    disabled={saving || selectedRole.is_system}
                    style={{ padding: '7px 18px', borderRadius: 8, backgroundColor: '#3B82F6', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: (saving || selectedRole.is_system) ? 'not-allowed' : 'pointer', opacity: (saving || selectedRole.is_system) ? 0.5 : 1 }}
                  >
                    {tCommon('save')}
                  </button>
                </div>
              </div>

              {/* Privileges body */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>

                {/* ── Доступные модули ── */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: '#10B981', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#065F46', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {t('available_modules_title')}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 8 }}>
                    {ALL_MODULES.map(mod => {
                      const isOn = selectedRole.is_system || rolePrivs.has(`${mod.code}::access`)
                      return (
                        <div key={mod.code} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '7px 10px', borderRadius: 8,
                          border: `1px solid ${isOn ? '#A7F3D0' : '#E5E7EB'}`,
                          backgroundColor: isOn ? '#F0FDF4' : '#F9FAFB',
                        }}>
                          <span style={{ fontSize: 12, color: '#374151', fontWeight: isOn ? 500 : 400 }}>{mod.name}</span>
                          <button
                            type="button"
                            onClick={() => !selectedRole.is_system && togglePriv(mod.code, 'access')}
                            style={{
                              width: 34, height: 18, borderRadius: 9, position: 'relative',
                              border: 'none', cursor: selectedRole.is_system ? 'default' : 'pointer',
                              backgroundColor: isOn ? '#10B981' : '#D1D5DB',
                              transition: 'background-color 0.2s', flexShrink: 0, marginLeft: 8,
                            }}
                          >
                            <span style={{
                              position: 'absolute', top: 2, left: isOn ? 18 : 2,
                              width: 14, height: 14, borderRadius: '50%', backgroundColor: '#fff',
                              transition: 'left 0.2s', display: 'block',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div style={{ borderBottom: '1px solid #E5E7EB', marginBottom: 20 }} />

                {/* ── Привилегии ── */}
                {loadingPrivs ? (
                  <div style={{ color: '#9CA3AF', fontSize: 13 }}>{t('loading')}</div>
                ) : Object.keys(grouped).length === 0 ? (
                  <div style={{ color: '#9CA3AF', fontSize: 13 }}>{t('no_privileges')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {Object.entries(grouped).map(([module, privs]) => {
                      const allChecked = privs.every(p => rolePrivs.has(`${module}::${p.privilege_code}`))
                      return (
                        <div key={module}>
                          {/* Module section header */}
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px',
                            backgroundColor: '#F8FAFC',
                            borderRadius: 8,
                            border: '1px solid #E5E7EB',
                            marginBottom: 10,
                          }}>
                            <div style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: '#3B82F6', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
                              {module}
                            </span>
                            {/* Select-all checkbox */}
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: selectedRole.is_system ? 'default' : 'pointer', userSelect: 'none' }}>
                              <input
                                type="checkbox"
                                checked={allChecked}
                                onChange={e => {
                                  setRolePrivs(prev => {
                                    const next = new Set(prev)
                                    privs.forEach(p => {
                                      const key = `${module}::${p.privilege_code}`
                                      if (e.target.checked) next.add(key); else next.delete(key)
                                    })
                                    return next
                                  })
                                }}
                                style={{ accentColor: '#3B82F6' }}
                                disabled={selectedRole.is_system}
                              />
                              <span style={{ fontSize: 11, color: '#6B7280' }}>{t('all_label')}</span>
                            </label>
                            {/* Add privilege button */}
                            {!selectedRole.is_system && (
                              <button
                                onClick={() => setAddPrivModule(module)}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6, border: '1px solid #D1D5DB', backgroundColor: '#fff', fontSize: 11, color: '#374151', cursor: 'pointer' }}
                              >
                                <svg style={{ width: 10, height: 10 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                {t('add_privilege_button')}
                              </button>
                            )}
                          </div>

                          {/* Privilege cards */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: 8 }}>
                            {privs.map(p => {
                              const checked = rolePrivs.has(`${module}::${p.privilege_code}`)
                              return (
                                <label
                                  key={p.privilege_code}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 12px', borderRadius: 8,
                                    border: `1px solid ${checked ? '#C7D2FE' : '#E5E7EB'}`,
                                    cursor: selectedRole.is_system ? 'default' : 'pointer',
                                    userSelect: 'none',
                                    backgroundColor: checked ? '#EEF2FF' : '#fff',
                                    transition: 'background-color 0.1s, border-color 0.1s',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => !selectedRole.is_system && togglePriv(module, p.privilege_code)}
                                    style={{ accentColor: '#3B82F6' }}
                                    disabled={selectedRole.is_system}
                                  />
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: 12, fontWeight: 500, color: '#1F2937', margin: 0 }}>{p.name}</p>
                                    <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.privilege_code}</p>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {addOpen && (
        <AddRoleModal t={t} tCommon={tCommon} onClose={() => setAddOpen(false)} onSaved={role => { loadRoles(); selectRole(role); setAddOpen(false) }} />
      )}
      {addPrivModule && (
        <AddPrivilegeModal
          module={addPrivModule}
          t={t}
          tCommon={tCommon}
          onClose={() => setAddPrivModule(null)}
          onAdd={handleAddPrivilege}
        />
      )}
    </div>
  )
}
