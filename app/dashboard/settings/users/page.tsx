'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useLang } from '@/lib/i18n/LanguageContext'

const CAT_RU: Record<string, string> = {
  system: 'Системные',
  campus: 'Кампус',
  education: 'Образование',
  medical: 'Медицина',
  external: 'Внешние',
  custom: 'Прочие',
}
const CAT_HE: Record<string, string> = {
  system: 'מערכת',
  campus: 'קמפוס',
  education: 'חינוך',
  medical: 'רפואה',
  external: 'חיצוני',
  custom: 'אחר',
}
const CAT_EN: Record<string, string> = {
  system: 'System',
  campus: 'Campus',
  education: 'Education',
  medical: 'Medical',
  external: 'External',
  custom: 'Other',
}

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

const T = {
  ru: {
    title: 'Пользователи и доступ',
    search: 'Поиск по имени или email...',
    addUser: 'Добавить',
    name: 'Имя',
    email: 'Email',
    roles: 'Роли',
    status: 'Статус',
    lastLogin: 'Последний вход',
    actions: 'Действия',
    active: 'Активен',
    inactive: 'Неактивен',
    never: 'Никогда',
    manageRoles: 'Роли',
    deactivate: 'Деактивировать',
    activate: 'Активировать',
    save: 'Сохранить',
    cancel: 'Отмена',
    rolesModal: 'Управление ролями',
    addUserModal: 'Новый пользователь',
    fullName: 'Полное имя',
    password: 'Пароль',
    selectRoles: 'Роли',
    loading: 'Загрузка...',
    error: 'Ошибка загрузки',
    noUsers: 'Пользователи не найдены',
    all: 'Все',
    edit: 'Редактировать',
    editModal: 'Редактировать пользователя',
    resetPwd: 'Сбросить пароль',
    resetPwdModal: 'Сброс пароля',
    newPassword: 'Новый пароль',
    confirmPassword: 'Подтвердить пароль',
    passwordMismatch: 'Пароли не совпадают',
  },
  he: {
    title: 'משתמשים וגישה',
    search: 'חיפוש לפי שם או אימייל...',
    addUser: 'הוסף',
    name: 'שם',
    email: 'אימייל',
    roles: 'תפקידים',
    status: 'סטטוס',
    lastLogin: 'כניסה אחרונה',
    actions: 'פעולות',
    active: 'פעיל',
    inactive: 'לא פעיל',
    never: 'אף פעם',
    manageRoles: 'תפקידים',
    deactivate: 'השבת',
    activate: 'הפעל',
    save: 'שמור',
    cancel: 'בטל',
    rolesModal: 'ניהול תפקידים',
    addUserModal: 'משתמש חדש',
    fullName: 'שם מלא',
    password: 'סיסמה',
    selectRoles: 'תפקידים',
    loading: 'טוען...',
    error: 'שגיאת טעינה',
    noUsers: 'לא נמצאו משתמשים',
    all: 'הכל',
    edit: 'ערוך',
    editModal: 'ערוך משתמש',
    resetPwd: 'אפס סיסמה',
    resetPwdModal: 'איפוס סיסמה',
    newPassword: 'סיסמה חדשה',
    confirmPassword: 'אמת סיסמה',
    passwordMismatch: 'הסיסמאות אינן תואמות',
  },
  en: {
    title: 'Users & Access',
    search: 'Search by name or email...',
    addUser: 'Add User',
    name: 'Name',
    email: 'Email',
    roles: 'Roles',
    status: 'Status',
    lastLogin: 'Last Login',
    actions: 'Actions',
    active: 'Active',
    inactive: 'Inactive',
    never: 'Never',
    manageRoles: 'Roles',
    deactivate: 'Deactivate',
    activate: 'Activate',
    save: 'Save',
    cancel: 'Cancel',
    rolesModal: 'Manage Roles',
    addUserModal: 'New User',
    fullName: 'Full Name',
    password: 'Password',
    selectRoles: 'Roles',
    loading: 'Loading...',
    error: 'Load error',
    noUsers: 'No users found',
    all: 'All',
    edit: 'Edit',
    editModal: 'Edit User',
    resetPwd: 'Reset Password',
    resetPwdModal: 'Reset Password',
    newPassword: 'New Password',
    confirmPassword: 'Confirm Password',
    passwordMismatch: 'Passwords do not match',
  },
}

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  if (photo) return <img src={photo} alt={name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: '#2D3170', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{initials}</span>
    </div>
  )
}

function RoleBadge({ name }: { name: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, backgroundColor: '#EEF2FF', color: '#2D3170', fontSize: 11, fontWeight: 500, marginRight: 4, marginBottom: 2 }}>
      {name}
    </span>
  )
}

interface RolesModalProps {
  user: UserRow
  allRoles: Role[]
  t: typeof T.ru
  onClose: () => void
  onSaved: () => void
}

function RolesModal({ user, allRoles, t, onClose, onSaved }: RolesModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(user.roles.map(r => r.id)))
  const [saving, setSaving] = useState(false)

  const { lang } = useLang()
  const catLabel = (cat: string) =>
    lang === 'he' ? (CAT_HE[cat] ?? cat) : lang === 'en' ? (CAT_EN[cat] ?? cat) : (CAT_RU[cat] ?? cat)

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
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937' }}>{t.rolesModal}: {user.full_name}</p>
          <button onClick={onClose} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 20px', flex: 1 }}>
          {Object.entries(grouped).map(([cat, roles]) => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{catLabel(cat)}</p>
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
                      style={{ accentColor: '#2D3170' }}
                    />
                    <span style={{ fontSize: 13, color: '#374151' }}>{r.name}</span>
                  </label>
                ))}
              </div>
            </div>
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

interface AddUserModalProps {
  allRoles: Role[]
  t: typeof T.ru
  onClose: () => void
  onSaved: () => void
}

interface PersonResult { id: string; full_name: string; email: string | null }

function AddUserModal({ allRoles, t, onClose, onSaved }: AddUserModalProps) {
  const { lang } = useLang()
  const catLabel = (cat: string) =>
    lang === 'he' ? (CAT_HE[cat] ?? cat) : lang === 'en' ? (CAT_EN[cat] ?? cat) : (CAT_RU[cat] ?? cat)

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
  const [roleIds, setRoleIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

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
    if (!email || !password) { setErr('Email и пароль обязательны'); return }
    if (password.length < 8) { setErr('Пароль минимум 8 символов'); return }
    if (!selectedPerson && !createNew) { setErr('Выберите человека или создайте нового'); return }
    if (createNew && !fullName.trim()) { setErr('Введите имя'); return }

    setSaving(true); setErr('')
    const body = selectedPerson
      ? { person_id: selectedPerson.id, login_email: email, password, role_ids: roleIds }
      : { full_name: fullName.trim(), login_email: email, password, role_ids: roleIds }

    const res = await fetch('/api/settings/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) { onSaved(); onClose() }
    else setErr(data.error ?? 'Ошибка')
  }

  const toggleRole = (id: string) =>
    setRoleIds(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id])

  const grouped: Record<string, Role[]> = {}
  for (const r of allRoles) {
    if (!grouped[r.category]) grouped[r.category] = []
    grouped[r.category].push(r)
  }

  const personChosen = !!selectedPerson || createNew

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937' }}>{t.addUserModal}</p>
          <button onClick={onClose} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <p style={{ color: '#DC2626', fontSize: 12, margin: 0 }}>{err}</p>}

          {/* ── Step 1: person selection ── */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
              Поиск существующего человека
            </p>

            {/* Show selected person card */}
            {selectedPerson && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: '1px solid #4BAED4', backgroundColor: '#F0F9FF' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#1F2937', margin: 0 }}>{selectedPerson.full_name}</p>
                  {selectedPerson.email && <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>{selectedPerson.email}</p>}
                </div>
                <button onClick={clearSelection} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            )}

            {/* Show "create new" confirmation */}
            {createNew && !selectedPerson && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB', backgroundColor: '#F9FAFB' }}>
                <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>Новый человек</p>
                <button onClick={clearSelection} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1 }}>×</button>
              </div>
            )}

            {/* Search input (hidden once a choice is made) */}
            {!personChosen && (
              <div style={{ position: 'relative' }}>
                <input
                  value={query}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Введите имя или email..."
                  autoComplete="off"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
                {(results.length > 0 || searching || (query.length >= 2 && !searching)) && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 4, overflow: 'hidden' }}>
                    {searching && (
                      <div style={{ padding: '10px 12px', fontSize: 12, color: '#9CA3AF' }}>Поиск...</div>
                    )}
                    {!searching && results.map(p => (
                      <div
                        key={p.id}
                        onClick={() => selectPerson(p)}
                        style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #F3F4F6' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#F9FAFB' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '' }}
                      >
                        <p style={{ fontSize: 13, fontWeight: 500, color: '#1F2937', margin: 0 }}>{p.full_name}</p>
                        {p.email && <p style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>{p.email}</p>}
                      </div>
                    ))}
                    {!searching && query.length >= 2 && (
                      <div
                        onClick={() => { setCreateNew(true); setResults([]); setQuery('') }}
                        style={{ padding: '10px 12px', cursor: 'pointer', color: '#2D3170', fontSize: 13, fontWeight: 500, borderTop: results.length > 0 ? '1px solid #E5E7EB' : 'none' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#F0F4FF' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '' }}
                      >
                        + Создать нового человека
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Step 2: name field (only for new person) ── */}
          {createNew && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t.fullName} *</span>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Полное имя"
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
              />
            </label>
          )}

          {/* ── Step 3: account fields ── */}
          {personChosen && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Email *</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t.password} *</span>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Минимум 8 символов"
                  autoComplete="new-password"
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
                />
              </label>

              {/* ── Step 4: roles ── */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 8 }}>{t.selectRoles}</p>
                {Object.entries(grouped).map(([cat, roles]) => (
                  <div key={cat} style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{catLabel(cat)}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {roles.map(r => (
                        <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                          <input type="checkbox" checked={roleIds.includes(r.id)} onChange={() => toggleRole(r.id)} style={{ accentColor: '#2D3170' }} />
                          <span style={{ fontSize: 13, color: '#374151' }}>{r.name}</span>
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
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>{t.cancel}</button>
          <button
            onClick={save}
            disabled={saving || !personChosen}
            style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: '#2D3170', color: '#fff', border: 'none', fontSize: 13, cursor: (saving || !personChosen) ? 'not-allowed' : 'pointer', opacity: (saving || !personChosen) ? 0.5 : 1 }}
          >
            {t.save}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Reset-password modal ─────────────────────────────────────────────────────

interface ResetPasswordModalProps {
  user: UserRow
  t: typeof T.ru
  onClose: () => void
}

function ResetPasswordModal({ user, t, onClose }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (password.length < 8) { setErr('Пароль минимум 8 символов'); return }
    if (password !== confirm) { setErr(t.passwordMismatch); return }
    setSaving(true); setErr('')
    const res = await fetch(`/api/settings/users/${user.account_id}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setSaving(false)
    if (res.ok) onClose()
    else { const d = await res.json(); setErr(d.error ?? 'Ошибка') }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937' }}>{t.resetPwdModal}: {user.full_name}</p>
          <button onClick={onClose} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <p style={{ color: '#DC2626', fontSize: 12, margin: 0 }}>{err}</p>}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t.newPassword} *</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Минимум 8 символов"
              autoComplete="new-password"
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t.confirmPassword} *</span>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Повторите пароль"
              autoComplete="new-password"
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${confirm && confirm !== password ? '#FCA5A5' : '#D1D5DB'}`, fontSize: 13, outline: 'none' }}
            />
          </label>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>{t.cancel}</button>
          <button onClick={save} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: '#DC2626', color: '#fff', border: 'none', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{t.resetPwd}</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit-user modal ───────────────────────────────────────────────────────────

interface EditUserModalProps {
  user: UserRow
  t: typeof T.ru
  onClose: () => void
  onSaved: () => void
}

function EditUserModal({ user, t, onClose, onSaved }: EditUserModalProps) {
  const [fullName, setFullName] = useState(user.full_name)
  const [email, setEmail] = useState(user.login_email)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [pwdOpen, setPwdOpen] = useState(false)

  async function save() {
    if (!fullName.trim() || !email.trim()) { setErr('Поля не могут быть пустыми'); return }
    setSaving(true); setErr('')
    const res = await fetch(`/api/settings/users/${user.account_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName.trim(), login_email: email.trim() }),
    })
    setSaving(false)
    if (res.ok) { onSaved(); onClose() }
    else { const d = await res.json(); setErr(d.error ?? 'Ошибка') }
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937' }}>{t.editModal}</p>
            <button onClick={onClose} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {err && <p style={{ color: '#DC2626', fontSize: 12, margin: 0 }}>{err}</p>}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{t.fullName}</span>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Email</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 13, outline: 'none' }}
              />
            </label>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => setPwdOpen(true)}
              style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', fontSize: 12, cursor: 'pointer', color: '#DC2626' }}
            >
              {t.resetPwd}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}>{t.cancel}</button>
              <button onClick={save} disabled={saving} style={{ padding: '7px 16px', borderRadius: 8, backgroundColor: '#2D3170', color: '#fff', border: 'none', fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>{t.save}</button>
            </div>
          </div>
        </div>
      </div>

      {pwdOpen && <ResetPasswordModal user={user} t={t} onClose={() => setPwdOpen(false)} />}
    </>
  )
}

export default function UsersPage() {
  const { lang } = useLang()
  const t = T[lang] ?? T.ru

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
    if (!usersRes.ok || !rolesRes.ok) { setError(t.error); setLoading(false); return }
    const [usersData, rolesData] = await Promise.all([usersRes.json(), rolesRes.json()])
    setUsers(usersData)
    setAllRoles(rolesData)
    setLoading(false)
  }, [t.error])

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
      <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Link href="/dashboard/settings" style={{ fontSize: 13, color: '#4BAED4', textDecoration: 'none' }}>
          {lang === 'he' ? 'הגדרות' : lang === 'en' ? 'Settings' : 'Настройки'}
        </Link>
        <span style={{ color: '#D1D5DB', fontSize: 14 }}>›</span>
        <span style={{ fontSize: 13, color: '#6B7280' }}>{t.title}</span>
      </nav>

      <div
        className="flex items-center rounded-xl overflow-hidden"
        style={{ backgroundColor: '#2D3170', borderLeft: '4px solid #4BAED4', padding: '12px 24px' }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF' }}>{t.title}</h1>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#9CA3AF' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.search}
            style={{ width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 8, paddingBottom: 8, borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, backgroundColor: '#F9FAFB', outline: 'none' }}
          />
        </div>
        <button
          onClick={() => setAddOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#2D3170', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t.addUser}
        </button>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>{t.loading}</div>
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#DC2626', fontSize: 13 }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>{t.noUsers}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                {[t.name, t.email, t.roles, t.status, t.lastLogin, t.actions].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <tr key={user.account_id} style={{ borderBottom: '1px solid #F3F4F6' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#F9FAFB' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '' }}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={user.full_name} photo={user.photo_url} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#1F2937' }}>{user.full_name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: '#6B7280' }}>{user.login_email}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: 260 }}>
                      {user.roles.slice(0, 3).map(r => <RoleBadge key={r.id} name={r.name} />)}
                      {user.roles.length > 3 && <span style={{ fontSize: 11, color: '#9CA3AF', alignSelf: 'center' }}>+{user.roles.length - 3}</span>}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                      backgroundColor: user.is_active ? '#D1FAE5' : '#FEE2E2',
                      color: user.is_active ? '#065F46' : '#991B1B',
                    }}>
                      {user.is_active ? t.active : t.inactive}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : t.never}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => setEditTarget(user)}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#374151' }}
                      >
                        {t.edit}
                      </button>
                      <button
                        onClick={() => setRolesTarget(user)}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', fontSize: 12, cursor: 'pointer', color: '#374151' }}
                      >
                        {t.manageRoles}
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
                          {user.is_active ? t.deactivate : t.activate}
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
        <EditUserModal user={editTarget} t={t} onClose={() => setEditTarget(null)} onSaved={load} />
      )}
      {rolesTarget && (
        <RolesModal user={rolesTarget} allRoles={allRoles} t={t} onClose={() => setRolesTarget(null)} onSaved={load} />
      )}
      {addOpen && (
        <AddUserModal allRoles={allRoles} t={t} onClose={() => setAddOpen(false)} onSaved={load} />
      )}
    </div>
  )
}
