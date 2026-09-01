'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { toastError } from '@/components/ui/toast'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { roleLabel } from '@/lib/roles/role-label'
import { isDeprecatedRole } from '@/lib/roles/deprecated'
import { getModuleColor } from '@/lib/module-colors'

/**
 * «הוספת בעל תפקיד» — ОДИН экран вместо 3-4 (создание человека, посадка,
 * роль/права, логин). Оркестрирует всё одним вызовом POST /api/staff/onboard
 * (+ создание роли при необходимости). Только superadmin.
 *
 * Разделы (сверху вниз, как в согласованном макете):
 *   1. Кто это         — существующий (поиск) или новый (имя + телефон).
 *   2. Тפקид ומחלקה    — должность (свободный текст ИЛИ каталог) + юнит + глава.
 *   3. פרטי העסקה      — зарплата (₽), часы, дата (всё опционально).
 *   4. מה הוא רואה     — роль: новая / существующая / позже (+ живая תצוגה מקדימה).
 *   5. התחברות         — (опц.) логин с автопаролем.
 */

interface Dept { id: string; name: string; name_he?: string | null; name_en?: string | null; parent_id?: string | null }
interface Position { id: string; name_ru: string | null; name_he: string | null; category: string }
interface Role { id: string; name: string; code: string; category: string }
interface ModulePriv { id: string; module: string; privilege_code: string; privilege_name: string; sort_order: number }
interface PersonHit { id: string; full_name: string; hebrew_name?: string | null; email: string | null }

interface ScopePreview {
  unit_name: string | null
  is_kodesh: boolean
  institutions: string[]
  tracks: { count: number; sample: string[] }
  subjects_count: number
  class_groups_count: number
  students: { all: boolean; count: number; sample: string[] }
  students_total: number
}

const MODULES = ['persons', 'education', 'finance', 'dormitory', 'food', 'security', 'alumni', 'sponsors', 'tasks', 'documents', 'reports', 'contacts', 'doctor', 'psychologist', 'maintenance', 'settings'] as const

export default function RoleSeatWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations('staff.wizard')
  const tCommon = useTranslations('common')
  const tCat = useTranslations('settings.categories')
  const { lang, t: pack } = useLang()

  const accent = getModuleColor('staff')

  // 1 — person
  const [personMode, setPersonMode] = useState<'existing' | 'new'>('existing')
  const [personQ, setPersonQ] = useState('')
  const [personHits, setPersonHits] = useState<PersonHit[]>([])
  const [person, setPerson] = useState<PersonHit | null>(null)
  const [newLast, setNewLast] = useState('')
  const [newFirst, setNewFirst] = useState('')
  const [newMiddle, setNewMiddle] = useState('')
  const [newPhone, setNewPhone] = useState('')

  // 2 — role label (position) + department
  const [depts, setDepts] = useState<Dept[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [positionInput, setPositionInput] = useState('')
  const [deptId, setDeptId] = useState('')
  const [isHead, setIsHead] = useState(false)

  // 3 — employment (optional)
  const [salary, setSalary] = useState('')
  const [hours, setHours] = useState('')
  const [hireDate, setHireDate] = useState('')

  // 4 — access / role
  const [roleMode, setRoleMode] = useState<'existing' | 'new' | 'later'>('new')
  const [roleName, setRoleName] = useState('')
  const [roleCat, setRoleCat] = useState('campus_management')
  const [existingRoleId, setExistingRoleId] = useState('')
  const [roles, setRoles] = useState<Role[]>([])
  const [catalog, setCatalog] = useState<ModulePriv[]>([])
  const [granted, setGranted] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [scope, setScope] = useState<'all' | 'department'>('department')

  // preview
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [preview, setPreview] = useState<ScopePreview | null>(null)

  // 5 — login
  const [makeLogin, setMakeLogin] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')

  // finish
  const [busy, setBusy] = useState(false)
  const [genPassword, setGenPassword] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const arr = (d: unknown) => (Array.isArray(d) ? d : [])
    fetch('/api/settings/roles').then(r => r.ok ? r.json() : []).then(d => setRoles(arr(d))).catch(() => {})
    fetch('/api/settings/role-privileges').then(r => r.ok ? r.json() : null).then(d => { if (d) setCatalog(arr(d.modulePrivileges)) }).catch(() => {})
    fetch('/api/settings/departments').then(r => r.ok ? r.json() : []).then(d => setDepts(arr(d))).catch(() => {})
    fetch('/api/settings/positions?active_only=true').then(r => r.ok ? r.json() : null).then(d => setPositions(arr((d as { positions?: unknown } | null)?.positions))).catch(() => {})
  }, [])

  // person search (debounced)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (person || personMode !== 'existing') return
    if (timer.current) clearTimeout(timer.current)
    if (personQ.trim().length < 2) { setPersonHits([]); return }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/settings/persons/search?q=${encodeURIComponent(personQ)}`)
      if (r.ok) { const d = await r.json(); setPersonHits(Array.isArray(d) ? d : []) }
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [personQ, person, personMode])

  // reset preview when department changes
  useEffect(() => { setPreviewOpen(false); setPreview(null) }, [deptId])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleName = (code: string) => (pack.nav as Record<string, string>)?.[code] ?? code
  const byModule = useMemo(() => {
    const m = new Map<string, ModulePriv[]>()
    for (const mp of catalog) { const a = m.get(mp.module) ?? []; a.push(mp); m.set(mp.module, a) }
    return m
  }, [catalog])
  const categories = useMemo(() => Array.from(new Set(['campus_management', ...roles.map(r => r.category)])), [roles])
  const rolesPack = useMemo(() => (pack.roles as Record<string, string>) ?? {}, [pack.roles])
  const roleLbl = (r: Role) => roleLabel(rolesPack, r.code, r.name)
  const rolesSorted = useMemo(
    () => (Array.isArray(roles) ? roles : [])
      .filter(r => !isDeprecatedRole(r.code))
      .sort((a, b) => roleLabel(rolesPack, a.code, a.name).localeCompare(roleLabel(rolesPack, b.code, b.name), 'he')),
    [roles, rolesPack],
  )
  const posName = (p: Position) => (lang === 'he' ? p.name_he : p.name_ru) || p.name_he || p.name_ru || ''

  function toggleAccess(mod: string) {
    const key = `${mod}::access`
    setGranted(prev => {
      const n = new Set(prev)
      if (n.has(key)) { n.delete(key); for (const mp of byModule.get(mod) ?? []) n.delete(`${mod}::${mp.privilege_code}`) }
      else n.add(key)
      return n
    })
  }
  function togglePriv(mod: string, code: string) {
    const key = `${mod}::${code}`
    setGranted(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else { n.add(key); if (code !== 'access') n.add(`${mod}::access`) }
      return n
    })
  }
  function toggleExpand(mod: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(mod) ? n.delete(mod) : n.add(mod); return n })
  }
  const grantedModuleCount = MODULES.filter(m => granted.has(`${m}::access`)).length

  const templates: { key: string; label: string; modules: string[] }[] = [
    { key: 'edu', label: t('tpl_edu_manager'), modules: ['education', 'reports', 'persons'] },
    { key: 'sec', label: t('tpl_secretary'), modules: ['education'] },
    { key: 'teach', label: t('tpl_teacher'), modules: ['education'] },
    { key: 'view', label: t('tpl_viewer'), modules: ['reports', 'persons'] },
  ]
  function applyTemplate(mods: string[]) {
    const n = new Set<string>()
    for (const m of mods) n.add(`${m}::access`)
    setGranted(n)
  }

  async function loadPreview() {
    if (!deptId) return
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreview(null)
    try {
      const r = await fetch(`/api/staff/scope-preview?department_id=${encodeURIComponent(deptId)}`)
      if (r.ok) setPreview(await r.json())
      else { const b = await r.json().catch(() => ({})); toastError(b.error ?? t('err_onboard')) }
    } finally { setPreviewLoading(false) }
  }

  // validity
  const personOk = personMode === 'existing' ? !!person : (newFirst.trim().length > 0 || newLast.trim().length > 0)
  const positionOk = positionInput.trim().length > 0
  const roleOk = roleMode === 'later' ? true : roleMode === 'existing' ? !!existingRoleId : roleName.trim().length > 0
  const loginOk = !makeLogin || /.+@.+\..+/.test(loginEmail.trim())
  const canCreate = personOk && positionOk && !!deptId && roleOk && loginOk

  async function finish() {
    if (busy || !canCreate) return
    setBusy(true)
    try {
      // 1) role (create if new)
      let roleId: string | undefined
      if (roleMode === 'existing') roleId = existingRoleId || undefined
      else if (roleMode === 'new') {
        const code = 'role_' + Math.random().toString(36).slice(2, 9)
        const res = await fetch('/api/settings/roles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: roleName.trim(), code, category: roleCat, description: '' }),
        })
        if (!res.ok) { const b = await res.json().catch(() => ({})); toastError(b.error ?? t('err_role')); setBusy(false); return }
        roleId = (await res.json() as { id: string }).id
        const privileges = [...granted].map(k => {
          const [module, privilege_code] = k.split('::')
          return { module, privilege_code, scope: privilege_code === 'access' ? 'all' : scope }
        })
        if (privileges.length > 0) {
          const pr = await fetch('/api/settings/role-privileges', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role_id: roleId, privileges }),
          })
          if (!pr.ok) { const b = await pr.json().catch(() => ({})); toastError(b.error ?? t('err_privs')) }
        }
      }

      // 2) position: match catalog by name → position_id, else free-text label
      const typed = positionInput.trim()
      const matched = positions.find(p => posName(p).trim() === typed)

      // 3) onboard (single call)
      const payload: Record<string, unknown> = {
        department_id: deptId,
        is_head: isHead,
        hire_date: hireDate || null,
        role_id: roleId,
        login_email: makeLogin && loginEmail.trim() ? loginEmail.trim() : undefined,
      }
      if (matched) payload.position_id = matched.id
      else payload.position_label = typed
      if (salary.trim()) payload.salary = Number(salary)
      if (hours.trim()) payload.hours = Number(hours)
      if (personMode === 'existing') payload.person_id = person!.id
      else {
        payload.first_name = newFirst.trim()
        payload.last_name = newLast.trim()
        payload.middle_name = newMiddle.trim()
        payload.phone = newPhone.trim()
      }

      const res = await fetch('/api/staff/onboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); toastError(b.error ?? t('err_onboard')); setBusy(false); return }
      const d = await res.json().catch(() => ({})) as { generated_password?: string }
      if (d.generated_password) setGenPassword(d.generated_password)
      setDone(true)
      onDone()
    } finally { setBusy(false) }
  }

  const personName = personMode === 'existing'
    ? (person?.full_name ?? '')
    : [newFirst, newLast].filter(Boolean).join(' ')

  // ── styles ──
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '9px 11px', fontSize: 13.5, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }
  const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, display: 'block' }
  const chip = (active: boolean): React.CSSProperties => ({ padding: '6px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 99, cursor: 'pointer', border: `1px solid ${active ? accent : 'var(--border-strong)'}`, background: active ? accent : 'var(--surface)', color: active ? '#fff' : 'var(--text-muted)' })
  const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }
  const optBadge = <span style={{ fontSize: 11, color: 'var(--text-faint)', border: '1px dashed var(--border-strong)', borderRadius: 99, padding: '1px 8px', fontWeight: 600, marginInlineStart: 6 }}>{t('optional_badge')}</span>

  function SectionHead({ n, title, badge }: { n: number; title: string; badge?: boolean }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ flex: 'none', width: 24, height: 24, borderRadius: 7, background: 'var(--accent-tint)', color: accent, fontWeight: 800, fontSize: 13, display: 'grid', placeItems: 'center' }}>{n}</span>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
        {badge && optBadge}
      </div>
    )
  }
  const sectionWrap: React.CSSProperties = { padding: '16px 0', borderBottom: '1px solid var(--border)' }

  return (
    <Modal onClose={onClose} maxWidth={620} panelStyle={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>{t('screen_title')}</div>
          {!done && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{t('screen_sub')}</div>}
        </div>
        <button onClick={onClose} aria-label={tCommon('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1 }}>×</button>
      </div>

      <div style={{ overflowY: 'auto', padding: '4px 20px 8px', flex: 1 }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>{t('done_title')}</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 6 }}>{t('done_created').replace('{name}', personName || '—')}</div>
            {genPassword && (
              <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--accent-tint)', border: '1px solid var(--accent)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t('generated_password')}</div>
                <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, color: 'var(--text)', direction: 'ltr', unicodeBidi: 'isolate' }}>{genPassword}</code>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('password_hint')}</div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 1 — who */}
            <div style={sectionWrap}>
              <SectionHead n={1} title={t('sec_who')} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => setPersonMode('existing')} style={chip(personMode === 'existing')}>{t('who_existing')}</button>
                <button onClick={() => setPersonMode('new')} style={chip(personMode === 'new')}>{t('who_new')}</button>
              </div>
              {personMode === 'existing' ? (
                <div style={{ position: 'relative' }}>
                  <input value={person ? person.full_name : personQ} onChange={e => { setPerson(null); setPersonQ(e.target.value) }} placeholder={t('person_ph')} style={inp} />
                  {!person && personQ.trim().length >= 2 && personHits.length > 0 && (
                    <div style={{ position: 'absolute', zIndex: 20, insetInlineStart: 0, insetInlineEnd: 0, top: '100%', marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
                      {personHits.map(h => (
                        <div key={h.id} role="button" tabIndex={0} onClick={() => { setPerson(h); setPersonQ(''); if (h.email && !loginEmail) setLoginEmail(h.email) }}
                          onKeyDown={e => { if (e.key === 'Enter') { setPerson(h); setPersonQ('') } }}
                          style={{ padding: '8px 11px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>{h.full_name}{h.email ? ` · ${h.email}` : ''}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={row2}>
                    <div><label style={label}>{t('fn_last')}</label><input value={newLast} onChange={e => setNewLast(e.target.value)} style={inp} dir="rtl" /></div>
                    <div><label style={label}>{t('fn_first')}</label><input value={newFirst} onChange={e => setNewFirst(e.target.value)} style={inp} dir="rtl" /></div>
                  </div>
                  <div style={row2}>
                    <div><label style={label}>{t('fn_middle')}</label><input value={newMiddle} onChange={e => setNewMiddle(e.target.value)} style={inp} dir="rtl" /></div>
                    <div><label style={label}>{t('fn_phone')}</label><input value={newPhone} onChange={e => setNewPhone(e.target.value)} style={inp} dir="ltr" inputMode="tel" /></div>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{t('new_person_hint')}</div>
                </div>
              )}
            </div>

            {/* 2 — position + department */}
            <div style={sectionWrap}>
              <SectionHead n={2} title={t('sec_role_dept')} />
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={label}>{t('position_combo')} *</label>
                  <input value={positionInput} onChange={e => setPositionInput(e.target.value)} placeholder={t('position_combo_ph')} list="positions-list" style={inp} dir="rtl" />
                  <datalist id="positions-list">
                    {positions.map(p => <option key={p.id} value={posName(p)} />)}
                  </datalist>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('position_combo_hint')}</div>
                </div>
                <div>
                  <label style={label}>{t('department')} *</label>
                  <select value={deptId} onChange={e => setDeptId(e.target.value)} style={inp}>
                    <option value="">—</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{localizedDeptName(d, lang)}</option>)}
                  </select>
                  {depts.length === 0 && <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 6, fontWeight: 600 }}>{t('empty_list_hint')}</div>}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={isHead} onChange={e => setIsHead(e.target.checked)} style={{ accentColor: accent }} />
                  {t('is_head')}
                </label>
              </div>
            </div>

            {/* 3 — employment */}
            <div style={sectionWrap}>
              <SectionHead n={3} title={t('sec_employment')} badge />
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={row2}>
                  <div><label style={label}>{t('salary')}</label><input value={salary} onChange={e => setSalary(e.target.value.replace(/[^\d]/g, ''))} placeholder={t('salary_ph')} style={inp} inputMode="numeric" dir="ltr" /></div>
                  <div><label style={label}>{t('hours')}</label><input value={hours} onChange={e => setHours(e.target.value.replace(/[^\d]/g, ''))} placeholder={t('hours_ph')} style={inp} inputMode="numeric" dir="ltr" /></div>
                </div>
                <div>
                  <label style={label}>{t('hire_date')}</label>
                  <input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} style={inp} />
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('hire_date_hint')}</div>
                </div>
              </div>
            </div>

            {/* 4 — what they see */}
            <div style={sectionWrap}>
              <SectionHead n={4} title={t('sec_access_what')} />
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <button onClick={() => setRoleMode('new')} style={chip(roleMode === 'new')}>{t('role_mode_new')}</button>
                <button onClick={() => setRoleMode('existing')} style={chip(roleMode === 'existing')}>{t('role_mode_existing')}</button>
                <button onClick={() => setRoleMode('later')} style={chip(roleMode === 'later')}>{t('role_mode_later')}</button>
              </div>

              {roleMode === 'later' && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>{t('role_later_hint')}</div>}

              {roleMode === 'existing' && (
                <div>
                  <label style={label}>{t('pick_existing_role')} *</label>
                  <select value={existingRoleId} onChange={e => setExistingRoleId(e.target.value)} style={inp}>
                    <option value="">—</option>
                    {rolesSorted.map(r => <option key={r.id} value={r.id}>{roleLbl(r)}</option>)}
                  </select>
                </div>
              )}

              {roleMode === 'new' && (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={row2}>
                    <div><label style={label}>{t('role_name')} *</label><input value={roleName} onChange={e => setRoleName(e.target.value)} placeholder={t('role_name_ph')} dir="rtl" style={inp} /></div>
                    <div><label style={label}>{t('role_category')}</label><select value={roleCat} onChange={e => setRoleCat(e.target.value)} style={inp}>{categories.map(c => <option key={c} value={c}>{tCat(c, c)}</option>)}</select></div>
                  </div>
                  <div>
                    <label style={label}>{t('scope')}</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setScope('department')} style={chip(scope === 'department')}>{t('scope_dept')}</button>
                      <button onClick={() => setScope('all')} style={chip(scope === 'all')}>{t('scope_all')}</button>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{scope === 'department' ? t('scope_dept_hint') : t('scope_all_hint')}</div>
                  </div>
                  <div>
                    <label style={label}>{t('templates')}</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {templates.map(tp => <button key={tp.key} onClick={() => applyTemplate(tp.modules)} style={chip(false)}>{tp.label}</button>)}
                    </div>
                  </div>
                  <div>
                    <label style={label}>{t('modules')} · {t('chosen_n').replace('{n}', String(grantedModuleCount))}</label>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {MODULES.map(mod => {
                        const on = granted.has(`${mod}::access`)
                        const fine = (byModule.get(mod) ?? []).filter(mp => mp.privilege_code !== 'access')
                        const isOpen = expanded.has(mod)
                        return (
                          <div key={mod} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: on ? 'var(--accent-tint)' : 'var(--surface)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>
                              <button onClick={() => toggleAccess(mod)} role="switch" aria-checked={on} aria-label={moduleName(mod)}
                                style={{ width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', background: on ? accent : 'var(--border-strong)', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
                                <span style={{ position: 'absolute', top: 2, insetInlineStart: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'inset-inline-start .15s' }} />
                              </button>
                              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{moduleName(mod)}</span>
                              {on && fine.length > 0 && (
                                <button onClick={() => toggleExpand(mod)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 12, fontWeight: 600 }}>{isOpen ? t('less') : t('advanced')}</button>
                              )}
                            </div>
                            {on && isOpen && fine.length > 0 && (
                              <div style={{ padding: '0 12px 10px 12px', display: 'flex', flexWrap: 'wrap', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                                {fine.map(mp => {
                                  const k = `${mod}::${mp.privilege_code}`
                                  return (
                                    <label key={mp.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={granted.has(k)} onChange={() => togglePriv(mod, mp.privilege_code)} style={{ accentColor: accent }} />
                                      {mp.privilege_name || mp.privilege_code}
                                    </label>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* preview */}
              <div style={{ marginTop: 14 }}>
                <button onClick={loadPreview} disabled={!deptId}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', fontSize: 13, fontWeight: 700, borderRadius: 9, cursor: deptId ? 'pointer' : 'not-allowed', background: deptId ? 'var(--accent-tint)' : 'var(--surface-2)', color: deptId ? accent : 'var(--text-faint)', border: `1px solid ${deptId ? accent : 'var(--border)'}` }}>
                  👁 {t('preview_btn')}
                </button>
                {!deptId && <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('preview_pick_dept')}</div>}

                {previewOpen && (
                  <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)', padding: 14 }}>
                    {previewLoading ? (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>{t('preview_loading')}</div>
                    ) : preview ? (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{t('preview_title').replace('{unit}', preview.unit_name ?? '—')}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
                          <PreviewStat label={t('preview_institutions')} value={preview.institutions.length} accent={accent} />
                          <PreviewStat label={t('preview_tracks')} value={preview.tracks.count} accent={accent} />
                          <PreviewStat label={t('preview_subjects')} value={preview.subjects_count} accent={accent} />
                          <PreviewStat label={t('preview_groups')} value={preview.class_groups_count} accent={accent} />
                        </div>
                        {/* students */}
                        <div style={{ borderTop: '1px dashed var(--border-strong)', paddingTop: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{t('preview_students')}</span>
                            <span style={{ fontSize: 15, fontWeight: 800, color: accent, fontVariantNumeric: 'tabular-nums' }}>{preview.students.count}</span>
                          </div>
                          {preview.students.all ? (
                            <div style={{ fontSize: 11.5, color: 'var(--success)', fontWeight: 600, marginTop: 3 }}>{t('preview_students_all')}</div>
                          ) : preview.students_total > preview.students.count ? (
                            <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3 }}>{t('preview_hidden').replace('{n}', String(preview.students_total - preview.students.count))}</div>
                          ) : null}
                          {preview.students.sample.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {preview.students.sample.map((nm, i) => (
                                <span key={i} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{nm}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        {preview.tracks.sample.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {preview.tracks.sample.map((nm, i) => (
                              <span key={i} style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{nm}</span>
                            ))}
                          </div>
                        )}
                        <button onClick={() => setPreviewOpen(false)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', justifySelf: 'start', padding: 0 }}>{t('preview_close')}</button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* 5 — login */}
            <div style={{ padding: '16px 0 4px' }}>
              <SectionHead n={5} title={t('sec_login')} badge />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={makeLogin} onChange={e => setMakeLogin(e.target.checked)} style={{ accentColor: accent }} />
                {t('make_login')}
              </label>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>{t('make_login_hint')}</div>
              {makeLogin && (
                <div style={{ marginTop: 12 }}>
                  <label style={label}>{t('login_email')} *</label>
                  <input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="name@example.com" dir="ltr" style={{ ...inp, textAlign: 'start' }} />
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('password_auto')}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {done ? (
          <button onClick={onClose} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{t('finish_close')}</button>
        ) : (
          <>
            <button onClick={onClose} disabled={busy} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5, cursor: 'pointer' }}>{tCommon('cancel')}</button>
            <SubmitButton onClick={finish} loading={busy} disabled={!canCreate || busy}
              style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: (!canCreate || busy) ? 'var(--border)' : accent, color: (!canCreate || busy) ? 'var(--text-faint)' : '#fff', fontSize: 13.5, fontWeight: 600, cursor: (!canCreate || busy) ? 'not-allowed' : 'pointer' }}>
              {t('create_holder')}
            </SubmitButton>
          </>
        )}
      </div>
    </Modal>
  )
}

function PreviewStat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 11px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
    </div>
  )
}
