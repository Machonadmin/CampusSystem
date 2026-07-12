import { createServerClient } from '@/lib/supabase/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getSession } from './session'
import { getUserDepartmentIds } from '@/lib/education/permissions'
import type { SessionPayload } from './jwt'
import type { RoleCode, PrivilegeModule } from '@/types/database'

/**
 * Универсальная проверка привилегий module.code (role_privileges), без
 * привязки к education. Используется там, где модуль (persons, documents,
 * ...) не имеет собственного специализированного helper'а.
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
  if (session.roles.length === 0) return null

  const sb = createServerClient()

  const { data: roleRows } = await sb
    .from('roles')
    .select('id')
    .in('code', session.roles as RoleCode[])
  if (!roleRows || roleRows.length === 0) return null

  const { data: privs } = await sb
    .from('role_privileges')
    .select('scope')
    .eq('module', module)
    .eq('privilege_code', code)
    .in('role_id', roleRows.map(r => r.id))
  if (!privs || privs.length === 0) return null

  const rank: Record<PrivilegeScope, number> = { all: 3, department: 2, own: 1 }
  let best: PrivilegeScope | null = null
  for (const p of privs) {
    const s = p.scope as PrivilegeScope
    if (!best || rank[s] > rank[best]) best = s
  }
  return best
}

export async function hasPrivilege(
  session: SessionPayload | null,
  module: PrivilegeModule,
  code: string,
  target?: PrivilegeTarget,
): Promise<boolean> {
  if (!session) return false
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
