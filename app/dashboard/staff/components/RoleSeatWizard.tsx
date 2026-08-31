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
 * Мастер «תפקיד ושיבוץ» — единый поток вместо двух областей (роль в настройках +
 * посадка в кадрах). Оркеструет существующие API:
 *   POST /api/settings/roles            — создать роль-права (или берём существующую)
 *   PUT  /api/settings/role-privileges  — модули/действия + scope (all | department)
 *   POST /api/staff/seat                — подразделение + должность + роль + глава
 *   POST /api/settings/users            — (опц.) логин с автопаролем
 * Только superadmin (как и все три конечные точки).
 */

interface Dept { id: string; name: string; name_he?: string | null; name_en?: string | null; parent_id?: string | null }
interface Position { id: string; name_ru: string | null; name_he: string | null; category: string }
interface Role { id: string; name: string; code: string; category: string }
interface ModulePriv { id: string; module: string; privilege_code: string; name: string; sort_order: number }
interface PersonHit { id: string; full_name: string; hebrew_name?: string | null; email: string | null }

const MODULES = ['persons', 'education', 'finance', 'dormitory', 'food', 'security', 'alumni', 'sponsors', 'tasks', 'documents', 'reports', 'contacts', 'doctor', 'psychologist', 'maintenance', 'settings'] as const

export default function RoleSeatWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations('staff.wizard')
  const tCommon = useTranslations('common')
  const tCat = useTranslations('settings.categories')
  const { lang, t: pack } = useLang()

  const accent = getModuleColor('staff')
  const [step, setStep] = useState(1)

  // step 1 — role identity
  const [roleMode, setRoleMode] = useState<'new' | 'existing'>('new')
  const [roleName, setRoleName] = useState('')
  const [roleCat, setRoleCat] = useState('campus_management')
  const [existingRoleId, setExistingRoleId] = useState('')
  const [roles, setRoles] = useState<Role[]>([])

  // step 2 — permissions
  const [catalog, setCatalog] = useState<ModulePriv[]>([])
  const [granted, setGranted] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [scope, setScope] = useState<'all' | 'department'>('department')

  // step 3 — seat
  const [depts, setDepts] = useState<Dept[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [personQ, setPersonQ] = useState('')
  const [personHits, setPersonHits] = useState<PersonHit[]>([])
  const [person, setPerson] = useState<PersonHit | null>(null)
  const [deptId, setDeptId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [isHead, setIsHead] = useState(false)
  const [hireDate, setHireDate] = useState(() => new Date().toISOString().slice(0, 10))

  // step 4 — access
  const [makeLogin, setMakeLogin] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')

  // finish
  const [busy, setBusy] = useState(false)
  const [genPassword, setGenPassword] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Array.isArray-защита: если эндпоинт вернёт объект-ошибку (не массив),
    // [...roles].sort()/.map() уронили бы весь экран (error boundary).
    const arr = (d: unknown) => (Array.isArray(d) ? d : [])
    fetch('/api/settings/roles').then(r => r.ok ? r.json() : []).then(d => setRoles(arr(d))).catch(() => {})
    fetch('/api/settings/role-privileges').then(r => r.ok ? r.json() : null).then(d => { if (d) setCatalog(arr(d.modulePrivileges)) }).catch(() => {})
    fetch('/api/settings/departments').then(r => r.ok ? r.json() : []).then(d => setDepts(arr(d))).catch(() => {})
    // ВНИМАНИЕ: этот эндпоинт возвращает { positions: [...] } (обёртку), а не
    // голый массив — как и AddEmployeeModal, разворачиваем d.positions.
    fetch('/api/settings/positions?active_only=true').then(r => r.ok ? r.json() : null).then(d => setPositions(arr((d as { positions?: unknown } | null)?.positions))).catch(() => {})
  }, [])

  // person search (debounced)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (person) return
    if (timer.current) clearTimeout(timer.current)
    if (personQ.trim().length < 2) { setPersonHits([]); return }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/settings/persons/search?q=${encodeURIComponent(personQ)}`)
      if (r.ok) { const d = await r.json(); setPersonHits(Array.isArray(d) ? d : []) }
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [personQ, person])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moduleName = (code: string) => (pack.nav as Record<string, string>)?.[code] ?? code
  const byModule = useMemo(() => {
    const m = new Map<string, ModulePriv[]>()
    for (const mp of catalog) { const a = m.get(mp.module) ?? []; a.push(mp); m.set(mp.module, a) }
    return m
  }, [catalog])
  const categories = useMemo(() => Array.from(new Set(['campus_management', ...roles.map(r => r.category)])), [roles])
  // Показываем локализованное имя роли (как в карточке сотрудника), а не сырое
  // name из БД — иначе системные роли выглядели по-английски и владелец не мог
  // найти в списке ту же роль, что видит на карточке (напр. «ראש תוכנית»).
  const rolesPack = useMemo(() => (pack.roles as Record<string, string>) ?? {}, [pack.roles])
  const roleLbl = (r: Role) => roleLabel(rolesPack, r.code, r.name)
  // Показываем только актуальные роли (как экран управления ролями): legacy-роли
  // с русскими именами и без ивритского перевода скрыты — иначе список был кашей
  // из русских названий. Кастомные роли владельца остаются (они не deprecated).
  const rolesSorted = useMemo(
    () => (Array.isArray(roles) ? roles : [])
      .filter(r => !isDeprecatedRole(r.code))
      .sort((a, b) => roleLabel(rolesPack, a.code, a.name).localeCompare(roleLabel(rolesPack, b.code, b.name), 'he')),
    [roles, rolesPack],
  )

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

  const canNext = (() => {
    if (step === 1) return roleMode === 'new' ? roleName.trim().length > 0 : !!existingRoleId
    if (step === 3) return !!person && !!deptId && !!positionId
    if (step === 4) return !makeLogin || /.+@.+\..+/.test(loginEmail.trim())
    return true
  })()

  // Для существующей роли шаг «права» пропускаем.
  const steps = roleMode === 'existing' ? [1, 3, 4] : [1, 2, 3, 4]
  const stepIdx = steps.indexOf(step)
  function goNext() {
    if (stepIdx < steps.length - 1) setStep(steps[stepIdx + 1])
  }
  function goBack() {
    if (stepIdx > 0) setStep(steps[stepIdx - 1])
  }

  async function finish() {
    if (busy) return
    setBusy(true)
    try {
      let roleId = existingRoleId
      if (roleMode === 'new') {
        const code = 'role_' + Math.random().toString(36).slice(2, 9)
        const res = await fetch('/api/settings/roles', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: roleName.trim(), code, category: roleCat, description: '' }),
        })
        if (!res.ok) { const b = await res.json().catch(() => ({})); toastError(b.error ?? t('err_role')); setBusy(false); return }
        const created = await res.json() as { id: string }
        roleId = created.id
        const privileges = [...granted].map(k => {
          const [module, privilege_code] = k.split('::')
          return { module, privilege_code, scope: privilege_code === 'access' ? 'all' : scope }
        })
        if (privileges.length > 0) {
          const pr = await fetch('/api/settings/role-privileges', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role_id: roleId, privileges }),
          })
          if (!pr.ok) { const b = await pr.json().catch(() => ({})); toastError(b.error ?? t('err_privs')) /* роль создана — продолжаем к посадке */ }
        }
      }

      const seat = await fetch('/api/staff/seat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: person!.id, department_id: deptId, position_id: positionId, role_id: roleId, is_head: isHead, hire_date: hireDate }),
      })
      if (!seat.ok) { const b = await seat.json().catch(() => ({})); toastError(b.error ?? t('err_seat')); setBusy(false); return }

      if (makeLogin && loginEmail.trim()) {
        const u = await fetch('/api/settings/users', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person_id: person!.id, login_email: loginEmail.trim(), role_ids: roleId ? [roleId] : [], generate_password: true }),
        })
        if (u.ok) { const d = await u.json().catch(() => ({})); if (d.generated_password) setGenPassword(d.generated_password) }
        else { const b = await u.json().catch(() => ({})); toastError(b.error ?? t('err_login')) }
      }

      setDone(true)
      onDone()
    } finally { setBusy(false) }
  }

  // ── styles ──
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '9px 11px', fontSize: 13.5, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }
  const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 5, display: 'block' }
  const chip = (active: boolean): React.CSSProperties => ({ padding: '6px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 99, cursor: 'pointer', border: `1px solid ${active ? accent : 'var(--border-strong)'}`, background: active ? accent : 'var(--surface)', color: active ? '#fff' : 'var(--text-muted)' })

  const stepTitles: Record<number, string> = { 1: t('step_role'), 2: t('step_perms'), 3: t('step_seat'), 4: t('step_access') }

  return (
    <Modal onClose={onClose} maxWidth={560} panelStyle={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflowY: 'visible' }}>
      {/* header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{t('title')}</div>
          {!done && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{t('step_of').replace('{n}', String(stepIdx + 1)).replace('{total}', String(steps.length))} · {stepTitles[step]}</div>}
        </div>
        <button onClick={onClose} aria-label={tCommon('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1 }}>×</button>
      </div>

      {/* progress */}
      {!done && (
        <div style={{ display: 'flex', gap: 5, padding: '10px 20px 0' }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= stepIdx ? accent : 'var(--surface-2)' }} />
          ))}
        </div>
      )}

      <div style={{ overflowY: 'auto', padding: '18px 20px', flex: 1 }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 8 }}>{t('done_title')}</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 6 }}>
              {t('done_body').replace('{name}', person?.full_name ?? '').replace('{role}', roleMode === 'new' ? roleName : (() => { const r = roles.find(x => x.id === existingRoleId); return r ? roleLbl(r) : '' })())}
            </div>
            {genPassword && (
              <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'var(--accent-tint)', border: '1px solid var(--accent)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t('generated_password')}</div>
                <code style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, color: 'var(--text)', direction: 'ltr', unicodeBidi: 'isolate' }}>{genPassword}</code>
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('password_hint')}</div>
              </div>
            )}
          </div>
        ) : step === 1 ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setRoleMode('new')} style={chip(roleMode === 'new')}>{t('mode_new')}</button>
              <button onClick={() => setRoleMode('existing')} style={chip(roleMode === 'existing')}>{t('mode_existing')}</button>
            </div>
            {roleMode === 'new' ? (
              <>
                <div>
                  <label style={label}>{t('role_name')} *</label>
                  <input value={roleName} onChange={e => setRoleName(e.target.value)} placeholder={t('role_name_ph')} dir="rtl" style={inp} />
                </div>
                <div>
                  <label style={label}>{t('role_category')}</label>
                  <select value={roleCat} onChange={e => setRoleCat(e.target.value)} style={inp}>
                    {categories.map(c => <option key={c} value={c}>{tCat(c, c)}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>{t('role_hint')}</div>
              </>
            ) : (
              <div>
                <label style={label}>{t('pick_existing_role')} *</label>
                <select value={existingRoleId} onChange={e => setExistingRoleId(e.target.value)} style={inp}>
                  <option value="">—</option>
                  {rolesSorted.map(r => <option key={r.id} value={r.id}>{roleLbl(r)}</option>)}
                </select>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>{t('existing_hint')}</div>
              </div>
            )}
          </div>
        ) : step === 2 ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={label}>{t('templates')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {templates.map(tp => <button key={tp.key} onClick={() => applyTemplate(tp.modules)} style={chip(false)}>{tp.label}</button>)}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('templates_hint')}</div>
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
                          <button onClick={() => toggleExpand(mod)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 12, fontWeight: 600 }}>
                            {isOpen ? t('less') : t('advanced')}
                          </button>
                        )}
                      </div>
                      {on && isOpen && fine.length > 0 && (
                        <div style={{ padding: '0 12px 10px 12px', display: 'flex', flexWrap: 'wrap', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                          {fine.map(mp => {
                            const k = `${mod}::${mp.privilege_code}`
                            return (
                              <label key={mp.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={granted.has(k)} onChange={() => togglePriv(mod, mp.privilege_code)} style={{ accentColor: accent }} />
                                {mp.name}
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
        ) : step === 3 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 14 }}>
            <div style={{ position: 'relative' }}>
              <label style={label}>{t('person')} *</label>
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
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('person_hint')}</div>
            </div>
            <div>
              <label style={label}>{t('department')} *</label>
              <select value={deptId} onChange={e => setDeptId(e.target.value)} style={inp}>
                <option value="">—</option>
                {depts.map(d => <option key={d.id} value={d.id}>{localizedDeptName(d, lang)}</option>)}
              </select>
              {depts.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 6, fontWeight: 600 }}>{t('empty_list_hint')}</div>
              )}
            </div>
            <div>
              <label style={label}>{t('title_position')} *</label>
              <select value={positionId} onChange={e => setPositionId(e.target.value)} style={inp}>
                <option value="">—</option>
                {positions.map(p => <option key={p.id} value={p.id}>{(lang === 'he' ? p.name_he : p.name_ru) || p.name_he || p.name_ru}</option>)}
              </select>
              {/* Пустой список — тупик (position_id обязателен): показываем причину, а не молчим. */}
              {positions.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 6, fontWeight: 600 }}>{t('empty_list_hint')}</div>
              )}
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('title_hint')}</div>
            </div>
            <div>
              <label style={label}>{t('hire_date')}</label>
              <input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} style={inp} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={isHead} onChange={e => setIsHead(e.target.checked)} style={{ accentColor: accent }} />
              {t('is_head')}
            </label>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={makeLogin} onChange={e => setMakeLogin(e.target.checked)} style={{ accentColor: accent }} />
              {t('make_login')}
            </label>
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginTop: -6 }}>{t('make_login_hint')}</div>
            {makeLogin && (
              <div>
                <label style={label}>{t('login_email')} *</label>
                <input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="name@example.com" dir="ltr" style={{ ...inp, textAlign: 'start' }} />
                <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>{t('password_auto')}</div>
              </div>
            )}
            <div style={{ marginTop: 4, padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{t('summary')}</div>
              {t('sum_role')}: <b>{roleMode === 'new' ? (roleName || '—') : (() => { const r = roles.find(x => x.id === existingRoleId); return r ? roleLbl(r) : '—' })()}</b><br />
              {t('sum_person')}: <b>{person?.full_name ?? '—'}</b><br />
              {t('sum_dept')}: <b>{depts.find(d => d.id === deptId) ? localizedDeptName(depts.find(d => d.id === deptId)!, lang) : '—'}</b>{isHead ? ` · ${t('is_head')}` : ''}
            </div>
          </div>
        )}
      </div>

      {/* footer */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        {done ? (
          <button onClick={onClose} style={{ marginInlineStart: 'auto', padding: '9px 20px', borderRadius: 8, border: 'none', background: accent, color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{t('finish_close')}</button>
        ) : (
          <>
            <button onClick={stepIdx === 0 ? onClose : goBack} disabled={busy} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5, cursor: 'pointer' }}>
              {stepIdx === 0 ? tCommon('cancel') : t('back')}
            </button>
            {stepIdx === steps.length - 1 ? (
              <SubmitButton onClick={finish} loading={busy} disabled={!canNext || busy}
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: (!canNext || busy) ? 'var(--border)' : accent, color: (!canNext || busy) ? 'var(--text-faint)' : '#fff', fontSize: 13.5, fontWeight: 600, cursor: (!canNext || busy) ? 'not-allowed' : 'pointer' }}>
                {t('create_and_seat')}
              </SubmitButton>
            ) : (
              <button onClick={goNext} disabled={!canNext}
                style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: !canNext ? 'var(--border)' : accent, color: !canNext ? 'var(--text-faint)' : '#fff', fontSize: 13.5, fontWeight: 600, cursor: !canNext ? 'not-allowed' : 'pointer' }}>
                {t('next')}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
