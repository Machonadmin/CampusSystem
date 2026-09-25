import { createServerClient } from '@/lib/supabase/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getSession } from './session'
import { getUserDepartmentIds } from '@/lib/education/permissions'
import { journeyTarget } from '@/lib/education/journey-target'
import { reduceScopes, applyPersonGrants } from '@/lib/permissions/scope'
import { loadPersonModuleGrants } from '@/lib/permissions/person-grants'
import type { SessionPayload } from './jwt'
import type { RoleCode, PrivilegeModule } from '@/types/database'

/**
 * Универсальная проверка привилегий module.code. Используется там, где модуль
 * (persons, staff) не имеет собственного специализированного helper'а.
 *
 * ─── Почему здесь читаются ещё и личные права ───────────────────────────────
 *
 * Раньше эта функция смотрела ТОЛЬКО в role_privileges. Пока права жили на
 * должностях, разницы никто не замечал. Когда владелец снял права со всех
 * должностей и перевёл их на людей (20260917180000), разница стала поломкой:
 * гейт модуля (lib/permissions/module-gates.ts) личные права учитывает, а этот
 * файл — нет. Человек увидел бы плитку «מאגר האנשים» в меню и получил 403 на
 * самом экране — хуже, чем просто не видеть модуль.
 *
 * Теперь модель ровно та же, что в lib/permissions/module-factory.ts и в
 * lib/education/permissions.ts: роль даёт scope (reduceScopes), сверху
 * накладываются личные grant/deny (applyPersonGrants), где deny побеждает.
 *
 * Отсюда же следует, что проверка роли на входе больше не годится: человек
 * БЕЗ единой должности, но с личной выдачей — это и есть модель, которую
 * выбрал владелец, и раньше он получал бы отказ на пустом session.roles.
 *
 * Сознательно без in-memory кэша: такой кэш уже есть в
 * lib/education/permissions.ts и он не даёт реальной пользы на Vercel
 * serverless (см. диагностику проекта) — каждый invocation может попасть на
 * новый инстанс. Здесь просто читаем из БД каждый раз.
 */

export type PrivilegeScope = 'all' | 'department' | 'own'

export interface PrivilegeTarget {
  department_id?: string
  /**
   * Существующий объект без подразделения (например, позиция без
   * department_id). department-scope его НЕ покрывает — только 'all'
   * (симметрично с AccessTarget.unassigned в lib/permissions/scope.ts).
   */
  unassigned?: boolean
}

async function loadScope(
  session: SessionPayload,
  module: PrivilegeModule,
  code: string,
): Promise<PrivilegeScope | null> {
  // Токен студентки (портал) не несёт штатных прав, даже если этот же person
  // где-то сотрудник (личная выдача по person_id) — как в education/permissions.
  if (session.principal === 'student') return null

  const sb = createServerClient()

  // ── Что даёт должность ────────────────────────────────────────────────────
  // Ролей может не быть вовсе — тогда ролевая часть просто пустая, а решение
  // примут личные строки ниже.
  let fromRoles: Partial<Record<string, PrivilegeScope>> = {}
  if (session.roles.length > 0) {
    const { data: roleRows } = await sb
      .from('roles')
      .select('id')
      .in('code', session.roles as RoleCode[])

    if (roleRows && roleRows.length > 0) {
      const { data: privs } = await sb
        .from('role_privileges')
        .select('privilege_code, scope')
        .eq('module', module)
        .eq('privilege_code', code)
        .in('role_id', roleRows.map(r => r.id))
      if (privs && privs.length > 0) {
        fromRoles = reduceScopes<string>(privs) as Partial<Record<string, PrivilegeScope>>
      }
    }
  }

  // ── Что решили лично ──────────────────────────────────────────────────────
  // Просроченные строки отбрасывает сам загрузчик. deny побеждает роль.
  const grants = (await loadPersonModuleGrants(module, session.person_id))
    .filter(g => g.code === code)

  const effective = applyPersonGrants<string>(fromRoles, grants)
  return (effective[code] as PrivilegeScope | undefined) ?? null
}

export async function hasPrivilege(
  session: SessionPayload | null,
  module: PrivilegeModule,
  code: string,
  target?: PrivilegeTarget,
): Promise<boolean> {
  if (!session) return false
  // superadmin (кадровый principal, НЕ студенческий портал) — всегда всё, БЕЗ
  // зависимости от строк role_privileges. Иначе суперадмин мог потерять права
  // на persons.edit/create/delete, если роль superadmin пересохранили в
  // редакторе ролей без этих привилегий (или миграция-сидер не выполнялась) —
  // и тогда правка/удаление сотрудника отдавали 403. Симметрично с
  // lib/permissions/module-factory.ts и lib/education/permissions.ts.
  if (session.principal !== 'student' && session.roles.includes('superadmin')) return true
  const scope = await loadScope(session, module, code)
  if (!scope) return false
  if (scope === 'all') return true

  if (scope === 'department') {
    // Объект ещё не привязан к конкретному подразделению — считаем допустимым
    // (симметрично с hasEducationPrivilege в lib/education/permissions.ts).
    // Но существующий объект без подразделения (unassigned) — только для 'all'.
    if (target?.unassigned) return false
    if (!target?.department_id) return true
    const myDepts = await getUserDepartmentIds(session.person_id)
    return myDepts.includes(target.department_id)
  }

  // 'own' пока не используется ни одним call site для persons/documents —
  // явные семантики владения появятся вместе с конкретной задачей.
  return false
}

/**
 * Входит ли человек personId в зону department-ограниченного пользователя:
 *   • активная штатная позиция в одном из моих подразделений, или
 *   • journey, проходящая по journeyTarget (лид без подразделения — общий пул);
 *   • человек без позиций и без journeys (родственник, только что созданный) —
 *     не привязан ни к какому подразделению, считаем допустимым (как лид).
 */
async function personInMyDepartments(session: SessionPayload, personId: string): Promise<boolean> {
  const sb = createServerClient()
  const myDepts = await getUserDepartmentIds(session.person_id)
  const today = new Date().toISOString().split('T')[0]
  const [{ data: positions }, { data: journeys }] = await Promise.all([
    sb.from('staff_positions').select('department_id, end_date').eq('person_id', personId),
    sb.from('education_journeys')
      .select('education_status, primary_department_id, desired_department_id')
      .eq('person_id', personId),
  ])
  const active = (positions ?? []).filter(
    (r: { end_date: string | null }) => r.end_date === null || r.end_date > today,
  ) as { department_id: string | null }[]
  if (active.some(r => r.department_id && myDepts.includes(r.department_id))) return true
  for (const j of journeys ?? []) {
    const t = journeyTarget(j)
    if (t.unassigned) continue
    if (!t.department_id || myDepts.includes(t.department_id)) return true
  }
  return active.length === 0 && (journeys ?? []).length === 0
}

/**
 * Проверка module.code над КОНКРЕТНЫМ человеком (red-team 2026-09-25: маршруты
 * persons/[id]/* проверяли persons.edit без цели, и department-ограниченный
 * руководитель правил любого человека в системе). 'all' — любой человек,
 * 'department' — см. personInMyDepartments.
 */
export async function requirePersonPrivilege(
  module: PrivilegeModule,
  code: string,
  personId: string,
): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  }
  let ok = false
  if (session.principal !== 'student' && session.roles.includes('superadmin')) ok = true
  else {
    const scope = await loadScope(session, module, code)
    if (scope === 'all') ok = true
    else if (scope === 'department') ok = await personInMyDepartments(session, personId)
  }
  if (!ok) {
    throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
  }
  return session
}

/** Throws 401/403 — использовать в route handlers вместо голого getSession(). */
export async function requirePrivilege(
  module: PrivilegeModule,
  code: string,
  target?: PrivilegeTarget,
): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  }
  const ok = await hasPrivilege(session, module, code, target)
  if (!ok) {
    throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
  }
  return session
}
