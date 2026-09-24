import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { SessionPayload } from '@/lib/auth/jwt'
import { todayISO } from '@/lib/dates'
import { expandDepartmentTree, type DepartmentEdge } from '@/lib/permissions/scope'
import { getHeadedUnitIds } from '@/lib/education/unit-access'
import type { PrivilegeModule } from '@/types/database'
import { hasDataSecurityPrivilege, clearDataSecurityPermissionsCache } from './permissions'
import { loadPersonAccess } from './load'
import { privilegeKey, type BuiltTree, type TreeNode } from './tree'
import type { ResolvedPrivilege } from './person'
import type { UnitNode } from './units'

// ─── Ограниченная «אבטחת מידע» для главы отдела ──────────────────────────────
//
// Решение владельца: «глава отдела тоже получает אבטחת מידע, но ограниченно —
// доступ только к своему, и утвердить он может только то, что утверждено ему
// самому».
//
// Отсюда два множества, и оба считаются ТОЛЬКО на сервере (экран лишь
// повторяет их, чтобы не показывать недоступное):
//
//   personIds — «его команда»: люди с ДЕЙСТВУЮЩЕЙ посадкой (staff_positions,
//               end_date пуст или в будущем) в единице, которую он возглавляет,
//               или в любой единице ниже неё. Себя самого в команде нет: иначе
//               глава открыл бы себе что угодно из того, что держит лишь временно.
//   grantable — права, которые у него СЕЙЧАС действуют (права ролей + личные
//               выдачи − личные запреты, без просроченных), тем же расчётом, что
//               и на экране «по сотруднику» (resolvePersonPrivileges). Права
//               самого модуля data_security и 'delegate_privileges' исключены:
//               иначе появляется цепочка «выдал — тот выдал дальше».
//
// Чистые функции (команда, отбор выдаваемого, слияние при сохранении) вынесены
// отдельно и покрыты тестом head-scope.test.ts.

/** Модуль, чьи права глава не раздаёт никогда. */
const NEVER_GRANTABLE_MODULE = 'data_security'
/** Код, который глава не раздаёт ни в одном модуле. */
const NEVER_GRANTABLE_CODE = 'delegate_privileges'

export interface HeadScope {
  /** Единицы, которые он возглавляет (без разворота вниз). */
  headedUnitIds: string[]
  /** Его команда — без него самого. */
  personIds: Set<string>
  /** Ключи privilegeKey(module, code), которые он может выдать или закрыть. */
  grantable: Set<string>
}

// ── Чистые части ─────────────────────────────────────────────────────────────

export interface TeamSeat {
  person_id: string
  department_id: string | null
  end_date: string | null
}

/**
 * Команда главы: действующие посадки в возглавляемых единицах и во всём, что
 * ниже них. Разворот вниз — тот же expandDepartmentTree, которым считается и
 * доступ посаженного (lib/data-security/units.ts → seatReach).
 */
export function computeTeam(
  headedUnitIds: readonly string[],
  departments: readonly DepartmentEdge[],
  seats: readonly TeamSeat[],
  today: string,
  selfId: string,
): Set<string> {
  const out = new Set<string>()
  if (headedUnitIds.length === 0) return out
  const reach = new Set(expandDepartmentTree([...headedUnitIds], [...departments]))
  for (const s of seats) {
    if (!s.department_id || !reach.has(s.department_id)) continue
    if (!(s.end_date === null || s.end_date > today)) continue
    if (s.person_id === selfId) continue
    out.add(s.person_id)
  }
  return out
}

/** Что глава может выдать: действующие у него права, кроме запретных. */
export function grantableFrom(resolved: readonly ResolvedPrivilege[]): Set<string> {
  const out = new Set<string>()
  for (const r of resolved) {
    if (!r.granted || r.expired) continue
    if (r.module === NEVER_GRANTABLE_MODULE) continue
    if (r.code === NEVER_GRANTABLE_CODE) continue
    out.add(privilegeKey(r.module, r.code))
  }
  return out
}

/** Дерево отображения, в котором оставлены только выдаваемые права. */
export function pruneTreeToGrantable(tree: BuiltTree, grantable: ReadonlySet<string>): BuiltTree {
  const prune = (n: TreeNode): TreeNode | null => {
    const items = n.items.filter(i => grantable.has(privilegeKey(i.module, i.code)))
    const children = n.children.map(prune).filter((c): c is TreeNode => c !== null)
    if (items.length === 0 && children.length === 0) return null
    return { ...n, items, children }
  }
  return {
    roots: tree.roots.map(prune).filter((c): c is TreeNode => c !== null),
    unassigned: tree.unassigned.filter(i => grantable.has(privilegeKey(i.module, i.code))),
  }
}

/**
 * Дерево единиц, урезанное до возглавляемых единиц и того, что под ними:
 * они становятся корнями. Остальная оргструктура главе не показывается.
 */
export function pruneUnitsToHeaded(roots: readonly UnitNode[], headedUnitIds: readonly string[]): UnitNode[] {
  const headed = new Set(headedUnitIds)
  const out: UnitNode[] = []
  const walk = (n: UnitNode) => {
    if (headed.has(n.id)) { out.push(n); return }
    n.children.forEach(walk)
  }
  roots.forEach(walk)
  return out
}

/** Личная строка человека так, как она лежит в БД. */
export interface ExistingOverride {
  id: string
  module: string
  privilege_code: string
  is_granted: boolean
  expires_at: string | null
  reason: string | null
  granted_by: string | null
}

/** Личная строка так, как её присылает экран. */
export interface SubmittedOverride {
  module: string
  privilege_code: string
  is_granted: boolean
  expires_at?: string | null
  reason?: string | null
}

export interface OverrideRow {
  module: string
  privilege_code: string
  is_granted: boolean
  expires_at: string | null
  reason: string | null
  granted_by: string | null
}

export type HeadMergeResult =
  | {
    ok: true
    /** Строки вне выдаваемого — остаются в БД как есть, их не трогаем вовсе. */
    kept: ExistingOverride[]
    /** id строк внутри выдаваемого, которые заменяются присланными. */
    deleteIds: string[]
    /** Присланные строки внутри выдаваемого — вставляются от имени главы. */
    insert: OverrideRow[]
    /** Итоговый набор личных строк человека после сохранения. */
    final: OverrideRow[]
  }
  | { ok: false; key: string }

const norm = (v: string | null | undefined) => (v ?? null)

/**
 * Слияние при сохранении главой. Маршрут заменяет ВСЕ личные строки человека,
 * а глава видит и правит только выдаваемое — поэтому итог такой:
 *
 *   (строки из БД, чей ключ ВНЕ выдаваемого, — ровно как есть: срок, причина,
 *    кто выдал) + (присланные строки, чей ключ ВНУТРИ выдаваемого).
 *
 * Присланная строка вне выдаваемого допустима, только если она совпадает с
 * тем, что уже есть (экран присылает полный список решений, в том числе чужие).
 * Отличается — отказ: так глава не может ни открыть, ни закрыть, ни снять
 * чужое право. Строки вне выдаваемого, которые экран не прислал вовсе (например,
 * просроченные), тоже остаются — «стереть» их глава не может.
 */
export function mergeHeadOverrides(
  existing: readonly ExistingOverride[],
  submitted: readonly SubmittedOverride[],
  grantable: ReadonlySet<string>,
  headPersonId: string,
): HeadMergeResult {
  const existingByKey = new Map<string, ExistingOverride>()
  for (const e of existing) existingByKey.set(privilegeKey(e.module, e.privilege_code), e)

  const insertByKey = new Map<string, OverrideRow>()
  for (const s of submitted) {
    const key = privilegeKey(s.module, s.privilege_code)
    if (grantable.has(key)) {
      // Повтор ключа в запросе — побеждает последняя строка, как при upsert.
      insertByKey.set(key, {
        module: s.module,
        privilege_code: s.privilege_code,
        is_granted: !!s.is_granted,
        expires_at: s.expires_at ?? null,
        reason: s.reason?.trim() || null,
        granted_by: headPersonId,
      })
      continue
    }
    const cur = existingByKey.get(key)
    if (!cur) return { ok: false, key }
    if (cur.is_granted !== !!s.is_granted) return { ok: false, key }
    if (s.expires_at !== undefined && norm(s.expires_at) !== norm(cur.expires_at)) return { ok: false, key }
    if (s.reason !== undefined && (s.reason?.trim() || null) !== norm(cur.reason)) return { ok: false, key }
  }

  const kept = existing.filter(e => !grantable.has(privilegeKey(e.module, e.privilege_code)))
  const deleteIds = existing
    .filter(e => grantable.has(privilegeKey(e.module, e.privilege_code)))
    .map(e => e.id)
  const insert = [...insertByKey.values()]
  const final: OverrideRow[] = [
    ...kept.map(e => ({
      module: e.module, privilege_code: e.privilege_code, is_granted: e.is_granted,
      expires_at: e.expires_at, reason: e.reason, granted_by: e.granted_by,
    })),
    ...insert,
  ]
  return { ok: true, kept, deleteIds, insert, final }
}

// ── Серверные части ─────────────────────────────────────────────────────────

/**
 * Область главы отдела. null — не глава (или токен студентки: портал никогда
 * не управляет сотрудниками, даже если тот же person где-то оформлен главой).
 */
export async function getHeadScope(session: SessionPayload | null): Promise<HeadScope | null> {
  if (!session || session.principal === 'student') return null
  const headedUnitIds = await getHeadedUnitIds(session.person_id)
  if (headedUnitIds.length === 0) return null

  const sb = createServerClient()
  const [deptRes, seatRes, own] = await Promise.all([
    sb.from('departments').select('id, parent_id'),
    sb.from('staff_positions').select('person_id, department_id, end_date'),
    loadPersonAccess(session.person_id, 'he'),
  ])
  // Fail-closed: не прочитали структуру или посадку — команды нет.
  const departments = deptRes.error ? [] : ((deptRes.data ?? []) as DepartmentEdge[])
  const seats = seatRes.error ? [] : ((seatRes.data ?? []) as TeamSeat[])

  return {
    headedUnitIds,
    personIds: computeTeam(headedUnitIds, departments, seats, todayISO(), session.person_id),
    grantable: grantableFrom(own?.privileges ?? []),
  }
}

/**
 * Сессия идёт ограниченным путём записи: у неё НЕТ data_security.grant, но
 * она глава отдела. Держатель 'grant' (и superadmin) сюда не попадает — для
 * него маршрут работает как раньше.
 */
export async function getLimitedGrantContext(): Promise<{ session: SessionPayload; scope: HeadScope } | null> {
  const session = await getSession()
  if (!session) return null
  if (await hasDataSecurityPrivilege(session, 'grant')) return null
  const scope = await getHeadScope(session)
  return scope ? { session, scope } : null
}

/**
 * Сохранение личных решений главой. Строки вне выдаваемого не трогаются вовсе
 * (ни удаления, ни перезаписи); внутри выдаваемого — замена присланным.
 * 'forbidden' — человек не из команды или прислана чужая строка с изменением;
 * 'invalid' — права нет в каталоге.
 */
export async function saveHeadOverrides(
  ctx: { session: SessionPayload; scope: HeadScope },
  personId: string,
  submitted: readonly SubmittedOverride[],
): Promise<'ok' | 'forbidden' | 'invalid'> {
  if (!ctx.scope.personIds.has(personId)) return 'forbidden'

  const sb = createServerClient()
  const { data, error } = await sb
    .from('person_privileges')
    .select('id, module, privilege_code, is_granted, expires_at, reason, granted_by')
    .eq('person_id', personId)
  if (error) throw error

  const merged = mergeHeadOverrides(
    (data ?? []) as ExistingOverride[],
    submitted,
    ctx.scope.grantable,
    ctx.session.person_id,
  )
  if (!merged.ok) return 'forbidden'

  // Каталог — источник правды, как и на пути полного доступа: строка с кодом,
  // которого в каталоге нет, выглядела бы выданным правом, не давая ничего.
  if (merged.insert.length > 0) {
    const { data: catalog, error: catErr } = await sb.from('module_privileges').select('module, privilege_code')
    if (catErr) throw catErr
    const known = new Set((catalog ?? []).map(c => privilegeKey(c.module, c.privilege_code)))
    if (merged.insert.some(r => !known.has(privilegeKey(r.module, r.privilege_code)))) return 'invalid'
  }

  if (merged.deleteIds.length > 0) {
    const { error: delErr } = await sb.from('person_privileges').delete().in('id', merged.deleteIds)
    if (delErr) throw delErr
  }
  if (merged.insert.length > 0) {
    const { error: insErr } = await sb.from('person_privileges').insert(
      merged.insert.map(r => ({
        person_id: personId,
        module: r.module as PrivilegeModule,
        privilege_code: r.privilege_code,
        is_granted: r.is_granted,
        reason: r.reason,
        expires_at: r.expires_at,
        granted_by: r.granted_by,
      })),
    )
    if (insErr) throw insErr
  }

  clearDataSecurityPermissionsCache(personId)
  return 'ok'
}
