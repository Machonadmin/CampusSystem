import { createServerClient } from '@/lib/supabase/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getSession } from './session'
import { getUserDepartmentIds } from '@/lib/education/permissions'
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
}

async function loadScope(
  session: SessionPayload,
  module: PrivilegeModule,
  code: string,
): Promise<PrivilegeScope | null> {
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
    if (!target?.department_id) return true
    const myDepts = await getUserDepartmentIds(session.person_id)
    return myDepts.includes(target.department_id)
  }

  // 'own' пока не используется ни одним call site для persons/documents —
  // явные семантики владения появятся вместе с конкретной задачей.
  return false
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
