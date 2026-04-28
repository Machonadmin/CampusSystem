'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/i18n/LanguageContext'

// ── Category display config ──────────────────────────────────────────────────
const CAT_STYLE: Record<string, { bg: string; text: string }> = {
  system:    { bg: '#FEF3C7', text: '#92400E' },
  campus:    { bg: '#EEF2FF', text: '#1E40AF' },
  education: { bg: '#ECFDF5', text: '#065F46' },
  medical:   { bg: '#FEE2E2', text: '#991B1B' },
  external:  { bg: '#F3F4F6', text: '#4B5563' },
  custom:    { bg: '#F3F4F6', text: '#4B5563' },
}

function catLabel(cat: string, lang: string): string {
  const ru: Record<string, string> = { system: 'Системные', campus: 'Кампус', education: 'Образование', medical: 'Медицина', external: 'Внешние', custom: 'Прочие' }
  const he: Record<string, string> = { system: 'מערכת', campus: 'קמפוס', education: 'חינוך', medical: 'רפואה', external: 'חיצוני', custom: 'אחר' }
  const en: Record<string, string> = { system: 'System', campus: 'Campus', education: 'Education', medical: 'Medical', external: 'External', custom: 'Other' }
  return (lang === 'he' ? he : lang === 'en' ? en : ru)[cat] ?? cat
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

// ── Translations ─────────────────────────────────────────────────────────────
const T = {
  ru: {
    title: 'Роли и привилегии',
    settings: 'Настройки',
    addRole: 'Новая роль',
    selectRole: 'Выберите роль слева',
    module: 'Модуль',
    noRoles: 'Нет ролей',
    system: 'Системная',
    deleteRole: 'Удалить',
    save: 'Сохранить',
    cancel: 'Отмена',
    saved: 'Сохранено',
    roleName: 'Название',
    roleCode: 'Код',
    roleCategory: 'Категория',
    roleDesc: 'Описание',
    newRoleTitle: 'Новая роль',
    loading: 'Загрузка...',
    noPrivileges: 'Нет привилегий в каталоге',
    privileges: 'Привилегии',
    confirmDelete: 'Удалить роль?',
    error: 'Ошибка',
    all: 'все',
    addPrivilege: 'Добавить привилегию',
    addPrivTitle: 'Добавить привилегию',
    privName: 'Название',
    privCode: 'Код',
  },
  he: {
    title: 'תפקידים והרשאות',
    settings: 'הגדרות',
    addRole: 'תפקיד חדש',
    selectRole: 'בחר תפקיד',
    module: 'מודול',
    noRoles: 'אין תפקידים',
    system: 'מערכת',
    deleteRole: 'מחק',
    save: 'שמור',
    cancel: 'בטל',
    saved: 'נשמר',
    roleName: 'שם',
    roleCode: 'קוד',
    roleCategory: 'קטגוריה',
    roleDesc: 'תיאור',
    newRoleTitle: 'תפקיד חדש',
    loading: 'טוען...',
    noPrivileges: 'אין הרשאות',
    privileges: 'הרשאות',
    confirmDelete: 'למחוק תפקיד?',
    error: 'שגיאה',
    all: 'הכל',
    addPrivilege: 'הוסף הרשאה',
    addPrivTitle: 'הוסף הרשאה',
    privName: 'שם',
    privCode: 'קוד',
  },
  en: {
    title: 'Roles & Privileges',
    settings: 'Settings',
    addRole: 'New Role',
    selectRole: 'Select a role',
    module: 'Module',
    noRoles: 'No roles',
    system: 'System',
    deleteRole: 'Delete',
    save: 'Save',
    cancel: 'Cancel',
    saved: 'Saved',
    roleName: 'Name',
    roleCode: 'Code',
    roleCategory: 'Category',
    roleDesc: 'Description',
    newRoleTitle: 'New Role',
    loading: 'Loading...',
    noPrivileges: 'No privileges',
    privileges: 'Privileges',
    confirmDelete: 'Delete role?',
    error: 'Error',
    all: 'all',
    addPrivilege: 'Add privilege',
    addPrivTitle: 'Add privilege',
    privName: 'Name',
    privCode: 'Code',
  },
}

// ── AddRoleModal ─────────────────────────────────────────────────────────────
interface AddRoleModalProps {
  t: typeof T.ru
  onClose: () => void
  onSaved: (role: Role) => void
}

function AddRoleModal({ t, onClose, onSaved }: AddRoleModalProps) {
  const [form, setForm] = useState({ name: '', code: '', category: '', description: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!form.name || !form.code || !form.category) { setErr('Заполните обязательные поля'); return }
    setSaving(true); setErr('')
    const res = await fetch('/api/settings/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) onSaved(data)
    else setErr(data.error ?? t.error)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937' }}>{t.newRoleTitle}</p>
          <button onClick={onClose} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <p style={{ color: '#DC2626', fontSize: 12, margin: 0 }}>{err}</p>}
          {([['roleName', 'name'], ['roleCode', 'code'], ['roleCategory', 'category'], ['roleDesc', 'description']] as [keyof typeof T.ru, string][]).map(([label, field]) => (
            <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t[label]}{field !== 'description' ? ' *' : ''}</span>
              <input
                value={(form as Record<string, string>)[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
              />
            </label>
          ))}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>{t.cancel}</button>
          <button onClick={save} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: '#2D3170', color: '#fff', border: 'none', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{t.save}</button>
        </div>
      </div>
    </div>
  )
}

// ── AddPrivilegeModal ────────────────────────────────────────────────────────
interface AddPrivilegeModalProps {
  module: string
  t: typeof T.ru
  onClose: () => void
  onAdd: (module: string, name: string, code: string) => void
}

function AddPrivilegeModal({ module, t, onClose, onAdd }: AddPrivilegeModalProps) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')

  function submit() {
    if (!name.trim() || !code.trim()) { setErr('Заполните оба поля'); return }
    onAdd(module, name.trim(), code.trim())
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: '#1F2937', margin: 0 }}>{t.addPrivTitle}: <span style={{ color: '#2D3170' }}>{module}</span></p>
          <button onClick={onClose} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <p style={{ color: '#DC2626', fontSize: 12, margin: 0 }}>{err}</p>}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t.privName} *</span>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Просмотр записей"
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t.privCode} *</span>
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder={`${module}.view`}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none', fontFamily: 'monospace' }}
            />
          </label>
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>{t.cancel}</button>
          <button onClick={submit} style={{ padding: '6px 14px', borderRadius: 8, backgroundColor: '#2D3170', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>{t.addPrivilege}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function RolesPage() {
  const { lang } = useLang()
  const t = T[lang] ?? T.ru

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
    if (!confirm(t.confirmDelete)) return
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
      <nav style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <Link href="/dashboard/settings" style={{ fontSize: 13, color: '#4BAED4', textDecoration: 'none' }}>
          {t.settings}
        </Link>
        <span style={{ color: '#D1D5DB', fontSize: 14 }}>›</span>
        <span style={{ fontSize: 13, color: '#6B7280' }}>{t.title}</span>
      </nav>

      {/* Banner */}
      <div
        style={{ backgroundColor: '#2D3170', borderLeft: '4px solid #4BAED4', padding: '12px 24px', borderRadius: 12, flexShrink: 0 }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', margin: 0 }}>{t.title}</h1>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>

        {/* ── Left panel: roles list ── */}
        <div style={{ width: 268, flexShrink: 0, backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>Роли</span>
            <button
              onClick={() => setAddOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', backgroundColor: '#2D3170', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
            >
              <svg style={{ width: 11, height: 11 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t.addRole}
            </button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {Object.entries(groupedRoles).map(([cat, catRoles]) => {
              const style = CAT_STYLE[cat] ?? CAT_STYLE.custom
              return (
                <div key={cat}>
                  {/* Category header with colored background */}
                  <div style={{
                    padding: '6px 14px',
                    backgroundColor: style.bg,
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    borderTop: '1px solid rgba(0,0,0,0.05)',
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: style.text, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {catLabel(cat, lang)}
                    </span>
                  </div>
                  {catRoles.map(role => (
                    <div
                      key={role.id}
                      onClick={() => selectRole(role)}
                      style={{
                        padding: '9px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: selectedRole?.id === role.id ? '#EEF2FF' : 'transparent',
                        borderLeft: selectedRole?.id === role.id ? '3px solid #2D3170' : '3px solid transparent',
                        transition: 'background-color 0.1s',
                      }}
                      onMouseEnter={e => { if (selectedRole?.id !== role.id) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#F9FAFB' }}
                      onMouseLeave={e => { if (selectedRole?.id !== role.id) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent' }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: '#1F2937', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{role.name}</p>
                        <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0, fontFamily: 'monospace' }}>{role.code}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 6 }}>
                        {role.is_system && (
                          <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, backgroundColor: style.bg, color: style.text, fontWeight: 600, border: `1px solid ${style.text}22` }}>
                            {t.system}
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
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right panel: privileges ── */}
        <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedRole ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 13 }}>
              {t.selectRole}
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
                  {savedMsg && <span style={{ fontSize: 12, color: '#16A34A' }}>✓ {t.saved}</span>}
                  <button
                    onClick={savePrivileges}
                    disabled={saving || selectedRole.is_system}
                    style={{ padding: '7px 18px', borderRadius: 8, backgroundColor: '#2D3170', color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: (saving || selectedRole.is_system) ? 'not-allowed' : 'pointer', opacity: (saving || selectedRole.is_system) ? 0.5 : 1 }}
                  >
                    {t.save}
                  </button>
                </div>
              </div>

              {/* Privileges body */}
              <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>
                {loadingPrivs ? (
                  <div style={{ color: '#9CA3AF', fontSize: 13 }}>{t.loading}</div>
                ) : Object.keys(grouped).length === 0 ? (
                  <div style={{ color: '#9CA3AF', fontSize: 13 }}>{t.noPrivileges}</div>
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
                            <div style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: '#2D3170', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#2D3170', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
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
                                style={{ accentColor: '#2D3170' }}
                                disabled={selectedRole.is_system}
                              />
                              <span style={{ fontSize: 11, color: '#6B7280' }}>{t.all}</span>
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
                                {t.addPrivilege}
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
                                    style={{ accentColor: '#2D3170' }}
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
        <AddRoleModal t={t} onClose={() => setAddOpen(false)} onSaved={role => { loadRoles(); selectRole(role); setAddOpen(false) }} />
      )}
      {addPrivModule && (
        <AddPrivilegeModal
          module={addPrivModule}
          t={t}
          onClose={() => setAddPrivModule(null)}
          onAdd={handleAddPrivilege}
        />
      )}
    </div>
  )
}
