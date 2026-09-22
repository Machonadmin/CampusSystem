'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { personDisplayName } from '@/lib/persons/name'
import type { Lang } from '@/lib/i18n/translations'
import { useMe } from '@/lib/hooks/useMe'
import { useUrlTab } from '@/lib/nav/useUrlTab'
import AddEmployeeModal from './components/AddEmployeeModal'
import RoleSeatWizard from './components/RoleSeatWizard'
import MergeDuplicatesModal from './components/MergeDuplicatesModal'
import EmployeeCard from './components/EmployeeCard'
import HealthPanel from './components/HealthPanel'
import { PositionsPanel } from '@/app/dashboard/settings/positions/PositionsPanel'
import {
  RolesModal, AddUserModal, EditUserModal, RoleBadge,
  type UserRow, type Role, type PersonResult,
} from '@/app/dashboard/settings/users/UsersAccessPanel'
import { roleLabel } from '@/lib/roles/role-label'
import { getModuleColor } from '@/lib/module-colors'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import ModuleTabs from '@/components/ui/ModuleTabs'
import PageActionButton from '@/components/ui/PageActionButton'
import { toast } from '@/components/ui/toast'
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { PhoneLink } from '@/components/ui/PhoneLink'

interface Department {
  id: string
  name: string
  name_he?: string | null
  name_en?: string | null
  parent_id: string | null
  head_name: string | null
  employee_count: number
  sort_order?: number
  description?: string | null
}








// ── Employees tab ─────────────────────────────────────────────────────────────

interface Employee {
  position_id: string
  profile_id: string | null
  person_id: string
  full_name: string
  hebrew_name?: string | null
  photo_url: string | null
  gender: string | null
  phone: string | null
  email: string | null
  position: string
  is_head: boolean
  department_id: string
  department_name: string | null
  hire_date: string | null
  employment_type: string | null
  status: 'active' | 'fired' | 'sick_leave' | 'vacation'
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  active:     { bg: 'var(--success-tint)', fg: 'var(--success)' },
  sick_leave: { bg: 'var(--warn-tint)', fg: 'var(--warn)' },
  vacation:   { bg: 'var(--info-tint)', fg: 'var(--info)' },
  fired:      { bg: 'var(--danger-tint)', fg: 'var(--danger)' },
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
}

type DeptWithKids = Department & { children: DeptWithKids[] }

function flattenDeptOptions(depts: Department[], lang: Lang): { id: string; label: string }[] {
  const map = new Map<string, DeptWithKids>()
  for (const d of depts) map.set(d.id, { ...d, children: [] })
  const roots: DeptWithKids[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id)!.children.push(node)
    else roots.push(node)
  }
  const out: { id: string; label: string }[] = []
  const nm = (d: Department) => localizedDeptName(d, lang)
  function walk(node: DeptWithKids, depth: number) {
    out.push({ id: node.id, label: '  '.repeat(depth) + (depth > 0 ? '└ ' : '') + nm(node) })
    node.children.sort((a, b) => nm(a).localeCompare(nm(b))).forEach(c => walk(c, depth + 1))
  }
  roots.sort((a, b) => nm(a).localeCompare(nm(b))).forEach(r => walk(r, 0))
  return out
}

function EmployeesTab({ onAdd, depts, refreshSignal }: { onAdd: (employee?: Employee) => void; depts: Department[]; refreshSignal: number }) {
  const t = useTranslations('staff')
  const tCommon = useTranslations('common')
  // Пространства имён «משתמשים וגישה» — переиспользуем её модалки прямо здесь,
  // раз вкладки слиты в одну (запрос владельца).
  const tUsers = useTranslations('settings.users')
  const tCat = useTranslations('settings.categories')
  const me = useMe()
  const isSuperadmin = !!me?.roles.includes('superadmin')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [localRefresh, setLocalRefresh] = useState(0)
  const { lang, t: langPack } = useLang()
  const deptOptions = flattenDeptOptions(depts, lang)

  // Доступ/аккаунты (только superadmin — как и API /api/settings/users).
  const [users, setUsers] = useState<UserRow[]>([])
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [rolesTarget, setRolesTarget] = useState<UserRow | null>(null)
  const [editTarget, setEditTarget] = useState<UserRow | null>(null)
  const [addPerson, setAddPerson] = useState<PersonResult | null | undefined>(undefined) // undefined=закрыто, null=новый
  const [wizardOpen, setWizardOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  // «Карточка сотрудника» — всё об одном человеке в одном месте; открывается
  // кликом по строке (запрос владельца: «ניהול עובדים» вместо скрытого меню).
  const [cardTarget, setCardTarget] = useState<Employee | null>(null)

  function genderLabel(g: string | null): string | null {
    if (g === 'male') return t('gender.male')
    if (g === 'female') return t('gender.female')
    return null
  }

  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (search) params.set('search', search)
        if (deptFilter) params.set('department', deptFilter)
        const res = await fetch(`/api/staff?${params}`)
        if (res.ok) setEmployees(await res.json())
        else toast(tCommon('load_error'), 'error')
      } catch {
        toast(tCommon('load_error'), 'error')
      } finally { setLoading(false) }
    }, search ? 250 : 0)
    return () => clearTimeout(handle)
  }, [search, deptFilter, refreshSignal, localRefresh, tCommon])

  const loadUsers = useCallback(async () => {
    if (!isSuperadmin) return
    const [uRes, rRes] = await Promise.all([fetch('/api/settings/users'), fetch('/api/settings/roles')])
    if (uRes.ok) setUsers(await uRes.json())
    if (rRes.ok) setAllRoles(await rRes.json())
  }, [isSuperadmin])

  useEffect(() => { loadUsers() }, [loadUsers, refreshSignal, localRefresh])

  const usersByPerson = new Map<string, UserRow>()
  for (const u of users) usersByPerson.set(u.person_id, u)

  // Люди с доступом, у которых НЕТ рабочего места (не «сотрудник») — их тоже
  // показываем, чтобы после слияния вкладок никто не пропал.
  const empPersonIds = new Set(employees.map(e => e.person_id))
  const q = search.trim().toLowerCase()
  const accessOnly = deptFilter ? [] : users.filter(u =>
    !empPersonIds.has(u.person_id) &&
    (!q || u.full_name.toLowerCase().includes(q) || u.login_email.toLowerCase().includes(q))
  )

  async function handleDeleteEmployee(profileId: string, fullName: string) {
    if (!(await confirmDialog({ message: `${t('delete_employee_confirm_q1')} ${fullName}?\n\n${t('delete_employee_confirm_q2')}`, tone: 'danger' }))) return
    try {
      const res = await fetch(`/api/staff/${profileId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        toast(data.error || t('delete_error'), 'error')
        return
      }
      setLocalRefresh(n => n + 1)
    } catch {
      toast(t('delete_employee_error'), 'error')
    }
  }

  // «צפייה כמשתמש»: superadmin переключается в сессию сотрудника (read-only) и
  // видит систему его глазами. Возврат — через плашку внизу.
  async function viewAsUser(personId: string) {
    try {
      const res = await fetch('/api/auth/impersonate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast(d.error || t('view_as_error'), 'error'); return }
      window.location.href = '/dashboard'
    } catch {
      toast(t('view_as_error'), 'error')
    }
  }

  // Ячейка «доступ/роли» + действия по аккаунту (для superadmin).
  function accessCell(user: UserRow | undefined) {
    if (!user) return <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('access_none')}</span>
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: 240 }}>
        {user.roles.slice(0, 3).map(r => <RoleBadge key={r.id} name={roleLabel(langPack.roles, r.code, r.name)} module="staff" />)}
        {user.roles.length > 3 && <span style={{ fontSize: 11, color: 'var(--text-faint)', alignSelf: 'center' }}>+{user.roles.length - 3}</span>}
        {user.roles.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('access_no_roles')}</span>}
      </div>
    )
  }
  function accessActions(user: UserRow): RowAction[] {
    return [
      { key: 'roles', label: tUsers('manage_roles_button'), onClick: () => setRolesTarget(user) },
      { key: 'account', label: tUsers('edit_button'), onClick: () => setEditTarget(user) },
    ]
  }

  const hasAny = employees.length > 0 || accessOnly.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Самопроверка: пустые экраны / логины без посадки / дубли. Рендерится
          только когда есть что чинить. */}
      {isSuperadmin && (
        <HealthPanel refreshSignal={refreshSignal + localRefresh} onOpenMerge={() => setMergeOpen(true)} />
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input aria-label={t('search_by')} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search_by')}
          style={{ flex: '1 1 220px', padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none' }} />
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none', color: deptFilter ? 'var(--text)' : 'var(--text-faint)', minWidth: 200 }}>
          <option value="">{t('all_depts')}</option>
          {deptOptions.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        {/* ОДНА кнопка добавления (запрос владельца: раньше было три —
            «сотрудник» / «бейл-тафкид» / «пользователь», и было непонятно, чем
            они отличаются). Единый экран делает всё: человек + должность +
            подразделение + права + вход. Детальная форма осталась только как
            «עריכת כל הפרטים» из карточки, логин — «צור התחברות» там же. */}
        {isSuperadmin ? (
          <PageActionButton
            label={t('wizard.launch')}
            onClick={() => setWizardOpen(true)}
            accentColor={getModuleColor('staff')}
          />
        ) : (
          /* Не-superadmin не может звать /api/staff/onboard — ему детальная форма. */
          <button
            onClick={() => onAdd()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', background: 'var(--surface)', color: getModuleColor('staff'), border: `1px solid ${getModuleColor('staff')}` }}
          >
            {t('add_employee')}
          </button>
        )}
        {isSuperadmin && (
          <button
            onClick={() => setMergeOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border-strong)' }}
          >
            {t('merge.launch')}
          </button>
        )}
      </div>

      <div className="anim-rise" style={{ background: 'var(--surface)', borderRadius: 14, boxShadow: 'var(--shadow)', overflowX: 'auto' }}>
        {loading ? (
          <SkeletonRows avatar={false} rows={6} />
        ) : !hasAny ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>
            {search || deptFilter ? t('no_results') : t('no_employees')}
          </div>
        ) : (
          <table className="cards-sm" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--surface-2)' }}>
                {[
                  t('table.full_name'), t('table.position'), t('table.department'),
                  t('table.phone'), t('table.email'),
                  ...(isSuperadmin ? [t('table.access')] : []),
                  t('table.status'), '',
                ].map((h, i) => (
                  <th key={h || `blank${i}`} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textAlign: 'start', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => {
                const statusKey = emp.status ?? 'active'
                const sc = STATUS_COLORS[statusKey] ?? STATUS_COLORS.active
                const user = usersByPerson.get(emp.person_id)
                return (
                  <tr key={emp.position_id} style={{ borderBottom: '1px solid var(--surface-2)', cursor: 'pointer' }}
                    onClick={() => setCardTarget(emp)}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}>
                    <td data-label={t('table.full_name')} style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {emp.photo_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={emp.photo_url} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 30, height: 30, borderRadius: '50%', background: getModuleColor('staff', 'light'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: getModuleColor('staff'), flexShrink: 0 }}>{initials(emp.full_name)}</div>
                        }
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{personDisplayName(emp)}</span>
                            {genderLabel(emp.gender) && (
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--surface-2)', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                {genderLabel(emp.gender)}
                              </span>
                            )}
                          </div>
                          {emp.is_head && <div style={{ fontSize: 10, color: '#4BAED4', fontWeight: 500 }}>{t('dept.head_label')}</div>}
                        </div>
                      </div>
                    </td>
                    <td data-label={t('table.position')} style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)' }}>
                      <div>{emp.position}</div>
                      {emp.employment_type && emp.employment_type !== 'staff' && (
                        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t(`employment.${emp.employment_type}`, emp.employment_type)}</div>
                      )}
                    </td>
                    <td data-label={t('table.department')} style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)' }}>{emp.department_name ?? '—'}</td>
                    <td data-label={t('table.phone')} onClick={e => e.stopPropagation()} style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>{emp.phone ? <PhoneLink phone={emp.phone} /> : '—'}</td>
                    <td data-label={t('table.email')} style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)' }}>{emp.email ?? user?.login_email ?? '—'}</td>
                    {isSuperadmin && (
                      <td data-label={t('table.access')} style={{ padding: '10px 14px' }}>{accessCell(user)}</td>
                    )}
                    <td data-label={t('table.status')} style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: sc.bg, color: sc.fg, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {t(`status.${statusKey}`, statusKey)}
                      </span>
                    </td>
                    <td data-label="" onClick={e => e.stopPropagation()} style={{ padding: '10px 14px' }}>
                      <RowActionsMenu
                        accentColor={getModuleColor('staff')}
                        actions={[
                          // Доступ есть → управление ролями/аккаунтом; нет → создать вход.
                          ...(isSuperadmin && user ? accessActions(user) : []),
                          {
                            key: 'view_as',
                            label: t('view_as'),
                            onClick: () => viewAsUser(emp.person_id),
                            hidden: !isSuperadmin,
                          },
                          {
                            key: 'login',
                            label: t('create_login'),
                            onClick: () => setAddPerson({ id: emp.person_id, full_name: emp.full_name, hebrew_name: emp.hebrew_name, email: emp.email }),
                            hidden: !isSuperadmin || !!user,
                          },
                          { key: 'edit', label: tCommon('edit'), onClick: () => onAdd(emp), disabled: !emp.profile_id },
                          {
                            // Честный ярлык: API закрывает посадки (end_date), человек и
                            // логин остаются — «מחיקה» вводила владельца в заблуждение.
                            key: 'delete',
                            label: t('end_employment'),
                            onClick: () => emp.profile_id && handleDeleteEmployee(emp.profile_id, emp.full_name),
                            disabled: !emp.profile_id,
                            danger: true,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                )
              })}

              {/* Люди с доступом, но без рабочего места (только superadmin). */}
              {accessOnly.map(user => (
                <tr key={`au_${user.account_id}`} style={{ borderBottom: '1px solid var(--surface-2)', cursor: 'pointer' }}
                  onClick={() => setCardTarget({
                    position_id: `au_${user.account_id}`, profile_id: null, person_id: user.person_id,
                    full_name: user.full_name, hebrew_name: user.hebrew_name, photo_url: user.photo_url,
                    gender: null, phone: null, email: user.login_email, position: '', is_head: false,
                    department_id: '', department_name: null, hire_date: null, employment_type: null, status: 'active',
                  })}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}>
                  <td data-label={t('table.full_name')} style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {user.photo_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={user.photo_url} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        : <div style={{ width: 30, height: 30, borderRadius: '50%', background: getModuleColor('staff', 'light'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: getModuleColor('staff'), flexShrink: 0 }}>{initials(user.full_name)}</div>
                      }
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{personDisplayName(user)}</span>
                    </div>
                  </td>
                  <td data-label={t('table.position')} style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-faint)' }}>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: 'var(--surface-2)', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>{t('system_user')}</span>
                  </td>
                  <td data-label={t('table.department')} style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-faint)' }}>—</td>
                  <td data-label={t('table.phone')} style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-faint)' }}>—</td>
                  <td data-label={t('table.email')} style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text)' }}>{user.login_email}</td>
                  <td data-label={t('table.access')} style={{ padding: '10px 14px' }}>{accessCell(user)}</td>
                  <td data-label={t('table.status')} style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 99, fontWeight: 500, whiteSpace: 'nowrap',
                      background: user.is_active ? 'var(--success-tint)' : 'var(--danger-tint)',
                      color: user.is_active ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {user.is_active ? tUsers('active') : tUsers('inactive')}
                    </span>
                  </td>
                  <td data-label="" onClick={e => e.stopPropagation()} style={{ padding: '10px 14px' }}>
                    <RowActionsMenu accentColor={getModuleColor('staff')} actions={accessActions(user)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rolesTarget && (
        <RolesModal user={rolesTarget} allRoles={allRoles} t={tUsers} tCat={tCat} tCommon={tCommon}
          onClose={() => setRolesTarget(null)} onSaved={() => { setRolesTarget(null); setLocalRefresh(n => n + 1) }} />
      )}
      {editTarget && (
        <EditUserModal user={editTarget} t={tUsers} tCommon={tCommon}
          onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); setLocalRefresh(n => n + 1) }} />
      )}
      {addPerson !== undefined && (
        <AddUserModal
          key={addPerson?.id ?? 'new'}
          allRoles={allRoles}
          t={tUsers} tCat={tCat} tCommon={tCommon}
          initialPerson={addPerson}
          onClose={() => setAddPerson(undefined)}
          onSaved={() => setLocalRefresh(n => n + 1)}
        />
      )}
      {wizardOpen && (
        <RoleSeatWizard onClose={() => setWizardOpen(false)} onDone={() => setLocalRefresh(n => n + 1)} />
      )}
      {mergeOpen && (
        <MergeDuplicatesModal onClose={() => setMergeOpen(false)} onDone={() => setLocalRefresh(n => n + 1)} />
      )}
      {cardTarget && (() => {
        const cardUser = usersByPerson.get(cardTarget.person_id) ?? null
        const seats = employees.filter(e => e.person_id === cardTarget.person_id)
        const editable = seats.find(s => s.profile_id) ?? null
        return (
          <EmployeeCard
            person={cardTarget}
            seats={seats}
            user={cardUser}
            isSuperadmin={isSuperadmin}
            onClose={() => setCardTarget(null)}
            onEditDetails={editable ? () => { setCardTarget(null); onAdd(editable) } : null}
            onManageRoles={cardUser ? () => { setCardTarget(null); setRolesTarget(cardUser) } : null}
            onEditAccount={cardUser ? () => { setCardTarget(null); setEditTarget(cardUser) } : null}
            onCreateLogin={!cardUser ? () => { setCardTarget(null); setAddPerson({ id: cardTarget.person_id, full_name: cardTarget.full_name, hebrew_name: cardTarget.hebrew_name, email: cardTarget.email }) } : null}
            onViewAs={() => viewAsUser(cardTarget.person_id)}
            onDelete={editable?.profile_id ? () => { setCardTarget(null); handleDeleteEmployee(editable.profile_id!, cardTarget.full_name) } : null}
          />
        )
      })()}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const t = useTranslations('staff')
  const tNav = useTranslations('navigation')
  // Активная вкладка (צוות/תפקידים) — навигация: держим в URL (?tab=), чтобы
  // «назад» возвращал на прежнюю вкладку, а deep-link/обновление открывали ту же.
  // Старая ссылка ?tab=users (маршрут /settings/users) ведёт на слитую «staff».
  //
  // Вкладки «מבנה» здесь больше нет: оргструктура редактируется в «אבטחת מידע»
  // → «יחידות המוסד». Две копии одного дерева разошлись бы по правилам, а
  // единица — это НАСТОЯЩАЯ граница доступа, и решать, кого человек видит,
  // должно одно место. Старая ссылка ?tab=structure ведёт на «צוות».
  const [activeTab, setActiveTab] = useUrlTab({
    allowed: ['staff', 'positions'] as const,
    fallback: 'staff',
    aliases: { users: 'staff', structure: 'staff' },
  })
  const [depts, setDepts] = useState<Department[]>([])
  const [refreshSignal, setRefreshSignal] = useState(0)

  const [addEmployeeDept, setAddEmployeeDept] = useState<string | undefined>(undefined)
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)

  // Подразделения нужны фильтру во вкладке «צוות». Дерево их больше не рисует,
  // поэтому и скелетона со строкой ошибки здесь нет — но ПРИЧИНУ отказа терять
  // нельзя, она уходит в тост: молчащий фильтр не объясним ни пользователю, ни
  // поддержке.
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/departments')
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        toast(body?.error || t('load_error'), 'error')
        return
      }
      setDepts(await res.json())
    } catch {
      toast(t('load_error'), 'error')
    }
    // t стабилен в рамках языка; включаем в deps ради корректности хука.
  }, [t])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />

      <ModuleHeader module="staff" title={t('title')} />

      <ModuleTabs
        tabs={[
          // «צוות ומשתמשים» — сотрудники + доступ в ОДНОЙ вкладке (запрос владельца).
          // Колонка «доступ» и управление аккаунтами внутри — только superadmin.
          { key: 'staff', label: t('tabs.staff') },
          { key: 'positions', label: t('tabs.positions') },
        ]}
        active={activeTab}
        onChange={key => setActiveTab(key as 'staff' | 'positions')}
        accentColor={getModuleColor('staff')}
      />

      {/* Указатель вместо исчезнувшей вкладки. Без него тот, кто годами правил
          оргструктуру здесь, просто не найдёт её и решит, что пропала — этот
          круг уже был с деревом единиц. Ссылка видна всем: у кого нет доступа,
          модуль сам объяснит, какого права не хватает. */}
      <p style={{ margin: '0 0 4px', fontSize: 12.5, color: 'var(--text-muted)' }}>
        {t('structure_moved')}{' '}
        <Link href="/dashboard/data-security" style={{ color: 'var(--accent-strong)', fontWeight: 600 }}>
          {t('structure_moved_link')}
        </Link>
      </p>

      {activeTab === 'staff' && (
        <EmployeesTab
          onAdd={(employee) => { setEditingEmployee(employee ?? null); setAddEmployeeDept(undefined); setAddEmployeeOpen(true) }}
          depts={depts}
          refreshSignal={refreshSignal}
        />
      )}

      {/* Каталог должностей. Управление доступом слито в вкладку «staff». */}
      {activeTab === 'positions' && <PositionsPanel embedded />}

      {addEmployeeOpen && (
        <AddEmployeeModal
          defaultDepartmentId={addEmployeeDept}
          editing={editingEmployee}
          onClose={() => { setAddEmployeeOpen(false); setAddEmployeeDept(undefined); setEditingEmployee(null) }}
          onSaved={() => { setAddEmployeeOpen(false); setAddEmployeeDept(undefined); setEditingEmployee(null); load(); setRefreshSignal(s => s + 1) }}
        />
      )}
    </div>
  )
}
