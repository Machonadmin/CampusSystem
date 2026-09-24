'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { roleLabel } from '@/lib/roles/role-label'
import { isDeprecatedRole } from '@/lib/roles/deprecated'
import { getModuleColor } from '@/lib/module-colors'
import type { UnitNode } from '@/lib/data-security/units'
import { personSeats } from '@/lib/data-security/seating'
import { flattenUnits } from '@/lib/data-security/units'
import { cardStyle, type T } from './shared'

// ─── Роли и доступ к финансам — внутри вида «по сотруднику» ─────────────────
//
// Решение владельца: права правятся ТОЛЬКО в «אבטחת מידע». Назначение ролей
// человеку и выдача доступа к финансам переехали сюда из экрана сотрудников и
// из «גישה לכספים»; те экраны теперь только показывают и ведут сюда ссылкой.
//
// Маршруты API — прежние, со своими гейтами:
//   роли    — /api/settings/roles (список) и PUT /api/settings/users/[id]/roles,
//             только superadmin: 403 на списке → показываем роли без правки;
//   финансы — /api/finance/access (+ /[id]), только менеджер финансов:
//             403 → одна приглушённая строка «менять может менеджер финансов».
//   доп. время на посещаемость (переехало с экрана единиц) —
//             GET /api/education/units/[unitId]/members (значение extra_minutes и
//             can_grant_privileges) и PUT .../members/[personId]/attendance-grant.
//             Гейт PUT — canManageUnit (superadmin / глава единицы / делегат);
//             GET отдаёт can_grant_privileges ровно по тому же canManageUnit,
//             поэтому поле ввода открыто тогда и только тогда, когда PUT пройдёт.
//
// В ограниченном режиме главы отдела разделы ролей и финансов не показываются:
// глава не меняет ни роли, ни доступ к финансам. Остаётся только доп. время.

interface RoleRow { id: string; name: string; code: string; category: string }

interface FinanceGrant {
  id: string
  person_id: string
  scope: 'all' | 'journey'
  journey_id: string | null
  journey_name: string | null
}

const sectionTitle: React.CSSProperties = {
  margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--text)',
}
const muted: React.CSSProperties = { margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }
const smallBtn: React.CSSProperties = {
  padding: '4px 11px', borderRadius: 7, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 11.5,
  cursor: 'pointer', whiteSpace: 'nowrap',
}

export default function PersonAccessExtras({ personId, roles, units, limited = false, t, onChanged }: {
  personId: string
  /** Роли человека, уже загруженные видом (access.roles). */
  roles: { id: string; name: string }[]
  /** Дерево единиц экрана: по нему видно, в каких единицах человек сидит. */
  units: UnitNode[]
  /** Ограниченный режим главы отдела — только доп. время. */
  limited?: boolean
  t: T
  /** Перезагрузить вид после смены ролей: от ролей зависят фактические права. */
  onChanged?: () => void
}) {
  return (
    <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
      {!limited && <RolesSection personId={personId} roles={roles} t={t} onChanged={onChanged} />}
      {!limited && <FinanceSection personId={personId} t={t} />}
      <AttendanceSection personId={personId} units={units} t={t} />
    </div>
  )
}

// ── Роли ──────────────────────────────────────────────────────────────────────

function RolesSection({ personId, roles, t, onChanged }: {
  personId: string
  roles: { id: string; name: string }[]
  t: T
  onChanged?: () => void
}) {
  const { t: pack } = useLang()
  const rolesPack = useMemo(() => (pack.roles as Record<string, string>) ?? {}, [pack.roles])
  /** null — список ещё грузится или правка недоступна (не superadmin). */
  const [allRoles, setAllRoles] = useState<RoleRow[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(roles.map(r => r.id)))
  const [saving, setSaving] = useState(false)

  useEffect(() => { setSelected(new Set(roles.map(r => r.id))) }, [roles])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Список ролей отдаётся только superadmin — это и есть проверка права
        // на правку. 403 (и любая ошибка) → только просмотр.
        const res = await fetch('/api/settings/roles')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data)) setAllRoles(data as RoleRow[])
      } catch { /* только просмотр */ }
    })()
    return () => { cancelled = true }
  }, [])

  const initial = useMemo(() => new Set(roles.map(r => r.id)), [roles])
  const dirty = selected.size !== initial.size || [...selected].some(id => !initial.has(id))

  // Модель рензе (как в RolesModal): устаревшую роль показываем, только если она
  // уже назначена этому человеку — чтобы можно было снять; новым не предлагаем.
  const options = useMemo(() => (allRoles ?? [])
    .filter(r => !isDeprecatedRole(r.code) || initial.has(r.id))
    .sort((a, b) => roleLabel(rolesPack, a.code, a.name).localeCompare(roleLabel(rolesPack, b.code, b.name), 'he')),
  [allRoles, initial, rolesPack])

  const save = async () => {
    setSaving(true)
    try {
      // Сегмент [id] маршрутом PUT не читается — адресат задаёт person_id.
      const res = await fetch(`/api/settings/users/${personId}/roles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, role_ids: [...selected] }),
      })
      const body = await res.json().catch(() => null) as { error?: string } | null
      if (!res.ok) { toastError(body?.error || t('extras_roles_save_error')); return }
      toastSuccess(t('extras_roles_saved'))
      onChanged?.()
    } catch {
      toastError(t('extras_roles_save_error'))
    } finally { setSaving(false) }
  }

  return (
    <div style={{ ...cardStyle, padding: '12px 16px' }}>
      <h3 style={sectionTitle}>{t('extras_roles_title')}</h3>

      {allRoles === null ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {roles.length === 0
              ? <span style={muted}>{t('person_no_roles')}</span>
              : roles.map(r => (
                <span key={r.id} style={{ padding: '3px 10px', borderRadius: 7, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, fontWeight: 600, overflowWrap: 'anywhere' }}>{r.name}</span>
              ))}
          </div>
          <p style={{ ...muted, marginTop: 8, fontSize: 11.5 }}>{t('extras_roles_readonly')}</p>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
            {options.map(r => (
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
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{roleLabel(rolesPack, r.code, r.name)}</span>
              </label>
            ))}
          </div>
          <div className="ds-row" style={{ marginTop: 10 }}>
            <SubmitButton
              loading={saving}
              disabled={!dirty || saving}
              onClick={save}
              style={{
                padding: '7px 16px', borderRadius: 8, border: 0,
                background: dirty ? getModuleColor('data_security') : 'var(--surface-2)',
                color: dirty ? '#fff' : 'var(--text-muted)',
                fontSize: 13, fontWeight: 700, cursor: dirty ? 'pointer' : 'default',
              }}
            >{t('extras_roles_save')}</SubmitButton>
            {dirty && (
              <button onClick={() => setSelected(new Set(initial))} style={smallBtn}>{t('reset')}</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Доступ к финансам ────────────────────────────────────────────────────────

function FinanceSection({ personId, t }: { personId: string; t: T }) {
  const tFin = useTranslations('finance.access')
  const [grants, setGrants] = useState<FinanceGrant[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/access')
      if (res.status === 403) { setState('forbidden'); return }
      if (!res.ok) { setState('error'); return }
      const body = await res.json() as { grants?: FinanceGrant[] }
      setGrants((body.grants ?? []).filter(g => g.person_id === personId))
      setState('ready')
    } catch {
      setState('error')
    }
  }, [personId])

  useEffect(() => { setState('loading'); load() }, [load])

  const grantAll = async () => {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/finance/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, scope: 'all' }),
      })
      if (!res.ok) { toastError(tFin('grant_failed')); return }
      toastSuccess(tFin('granted'))
      await load()
    } catch {
      toastError(tFin('grant_failed'))
    } finally { setBusy(false) }
  }

  const revoke = async (id: string) => {
    if (!(await confirmDialog({ message: tFin('revoke_confirm'), tone: 'danger' }))) return
    try {
      const res = await fetch(`/api/finance/access/${id}`, { method: 'DELETE' })
      if (!res.ok) { toastError(tFin('grant_failed')); return }
      await load()
    } catch {
      toastError(tFin('grant_failed'))
    }
  }

  const hasAll = grants.some(g => g.scope === 'all')

  return (
    <div style={{ ...cardStyle, padding: '12px 16px' }}>
      <h3 style={sectionTitle}>{t('extras_finance_title')}</h3>

      {state === 'loading' && <p style={muted}>…</p>}
      {state === 'forbidden' && <p style={muted}>{t('extras_finance_readonly')}</p>}
      {state === 'error' && <p style={{ ...muted, color: 'var(--danger)' }}>{tFin('load_error')}</p>}

      {state === 'ready' && (
        <>
          {grants.length === 0 ? (
            <p style={muted}>{t('extras_finance_none')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {grants.map(g => (
                <div key={g.id} className="ds-row" style={{ padding: '4px 0' }}>
                  <span className="ds-grow" style={{ fontSize: 13, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                    {g.scope === 'all' ? tFin('scope_all') : (g.journey_name || '—')}
                  </span>
                  <button onClick={() => revoke(g.id)} style={{ ...smallBtn, color: 'var(--danger)' }}>
                    {tFin('revoke')}
                  </button>
                </div>
              ))}
            </div>
          )}
          {!hasAll && (
            <SubmitButton
              loading={busy}
              onClick={grantAll}
              style={{
                marginTop: 10, padding: '7px 16px', borderRadius: 8, border: 0,
                background: getModuleColor('finance'), color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >{t('extras_finance_grant_all')}</SubmitButton>
          )}
        </>
      )}
    </div>
  )
}

// ── Доп. время на отметку посещаемости ──────────────────────────────────────
//
// Раньше правилось на экране единиц (/dashboard/education/units). Показываем
// каждую единицу, где человек посажен учителем. Значение хранится одно на
// учителя (teacher_attendance_grants с lesson_id = NULL), а не на единицу, —
// поэтому в нескольких строках будет одно и то же число; строка единицы нужна
// потому, что право на правку (canManageUnit) считается по единице.

interface AttendanceRow {
  unitId: string
  unitName: string
  extraMinutes: number
  canEdit: boolean
}

interface UnitMember {
  person_id: string
  role: 'studies_secretary' | 'teacher'
  extra_minutes?: number
}

function AttendanceSection({ personId, units, t }: { personId: string; units: UnitNode[]; t: T }) {
  const [rows, setRows] = useState<AttendanceRow[] | null>(null)

  const unitIds = useMemo(
    () => [...new Set(personSeats(units, personId).map(s => s.departmentId))],
    [units, personId],
  )
  const nameById = useMemo(
    () => new Map(flattenUnits(units).map(u => [u.id, u.label])),
    [units],
  )

  useEffect(() => {
    let cancelled = false
    setRows(null)
    ;(async () => {
      const out: AttendanceRow[] = []
      for (const unitId of unitIds) {
        try {
          // Состав единицы читает глава/делегат или держатель manage_units;
          // остальным 403 — такую единицу просто не показываем.
          const res = await fetch(`/api/education/units/${unitId}/members`)
          if (!res.ok) continue
          const body = await res.json() as { members?: UnitMember[]; can_grant_privileges?: boolean }
          const member = (body.members ?? []).find(m => m.person_id === personId && m.role === 'teacher')
          if (!member) continue
          out.push({
            unitId,
            unitName: nameById.get(unitId) ?? '—',
            extraMinutes: member.extra_minutes ?? 0,
            canEdit: body.can_grant_privileges === true,
          })
        } catch { /* сеть — пропускаем единицу */ }
      }
      if (!cancelled) setRows(out)
    })()
    return () => { cancelled = true }
  }, [unitIds, personId, nameById])

  return (
    <div style={{ ...cardStyle, padding: '12px 16px' }}>
      <h3 style={sectionTitle}>{t('extras_attendance_title')}</h3>
      {rows === null && <p style={muted}>…</p>}
      {rows !== null && rows.length === 0 && <p style={muted}>{t('extras_attendance_none')}</p>}
      {rows !== null && rows.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.map(r => (
            <AttendanceRowEditor key={r.unitId} row={r} personId={personId} t={t} />
          ))}
          {rows.some(r => !r.canEdit) && (
            <p style={{ ...muted, fontSize: 11.5 }}>{t('extras_attendance_readonly')}</p>
          )}
        </div>
      )}
    </div>
  )
}

function AttendanceRowEditor({ row, personId, t }: { row: AttendanceRow; personId: string; t: T }) {
  const [val, setVal] = useState(String(row.extraMinutes))
  const [saved, setSaved] = useState(row.extraMinutes)
  const [saving, setSaving] = useState(false)
  const dirty = (Number(val) || 0) !== saved

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/education/units/${row.unitId}/members/${personId}/attendance-grant`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra_minutes: Number(val) || 0 }),
      })
      const body = await res.json().catch(() => null) as { error?: string; extra_minutes?: number } | null
      if (!res.ok) { toastError(body?.error || t('extras_attendance_save_error')); return }
      const next = typeof body?.extra_minutes === 'number' ? body.extra_minutes : (Number(val) || 0)
      setSaved(next)
      setVal(String(next))
      toastSuccess(t('extras_attendance_saved'))
    } catch {
      toastError(t('extras_attendance_save_error'))
    } finally { setSaving(false) }
  }

  return (
    <div className="ds-row" style={{ padding: '4px 0', flexWrap: 'wrap' }}>
      <span className="ds-grow" style={{ fontSize: 13, color: 'var(--text)', overflowWrap: 'anywhere' }}>{row.unitName}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('extras_attendance_minutes')}</span>
      {row.canEdit ? (
        <>
          <input
            type="number"
            min={0}
            value={val}
            onChange={e => setVal(e.target.value)}
            aria-label={t('extras_attendance_minutes')}
            style={{ width: 80, padding: '5px 9px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text)' }}
          />
          <SubmitButton
            loading={saving}
            disabled={!dirty || saving}
            onClick={save}
            style={{
              padding: '6px 14px', borderRadius: 8, border: 0,
              background: dirty ? getModuleColor('data_security') : 'var(--surface-2)',
              color: dirty ? '#fff' : 'var(--text-muted)',
              fontSize: 12.5, fontWeight: 700, cursor: dirty ? 'pointer' : 'default',
            }}
          >{t('extras_attendance_save')}</SubmitButton>
        </>
      ) : (
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{saved}</span>
      )}
    </div>
  )
}
