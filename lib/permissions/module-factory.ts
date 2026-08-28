import { createServerClient } from '@/lib/supabase/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { RoleCode, PrivilegeModule } from '@/types/database'
import { reduceScopes, applyPersonGrants, type Scope } from '@/lib/permissions/scope'
import { loadPersonModuleGrants } from '@/lib/permissions/person-grants'

/**
 * Фабрика прав модуля. Раньше ~13 файлов lib/<module>/permissions.ts были
 * ПОСТРОЧНО идентичны (различались только строкой модуля, именем типа привилегии
 * и именами экспортов). Эта фабрика содержит единственную копию логики; каждый
 * модуль остаётся тонкой обёрткой, сохраняющей прежний публичный API (те же
 * имена функций и сигнатуры), поэтому вызывающий код не меняется.
 *
 * Модель доступа: роль даёт привилегию с максимальным scope (reduceScopes), затем
 * накладываются персональные grant/deny (applyPersonGrants). superadmin (не
 * студент) обходит проверки. Результат кэшируется на CACHE_TTL_MS у КАЖДОГО
 * модуля отдельно (каждый вызов makeModulePermissions создаёт свой Map).
 *
 * ВАЖНО: данные части модулей (медпункт, психолог и т.п.) не привязаны к
 * подразделению — любой присутствующий scope означает «разрешено». Тонкая
 * настройка scope (department/own) остаётся задачей самих маршрутов, как и было.
 */

const CACHE_TTL_MS = 30_000

export interface ModulePermissions<P extends string> {
  /** Есть ли у пользователя привилегия (любой scope = да; superadmin = да). */
  hasPrivilege(session: SessionPayload | null, privilege: P): Promise<boolean>
  /** Scope, с которым привилегия выдана, либо null. superadmin → 'all'. */
  getPrivilegeScope(session: SessionPayload | null, privilege: P): Promise<Scope | null>
  /** Для API: throw 401 если не залогинен, 403 если нет права; иначе session. */
  requirePrivilege(privilege: P): Promise<SessionPayload>
  /** Сброс кэша (например, после изменения ролей пользователя). */
  clearCache(personId?: string): void
}

export function makeModulePermissions<P extends string>(moduleName: string): ModulePermissions<P> {
  type PrivilegesMap = Partial<Record<P, Scope>>
  interface CacheEntry {
    privileges: PrivilegesMap
    expiresAt: number
  }

  const cache = new Map<string, CacheEntry>()

  function getCached(personId: string): CacheEntry | null {
    const entry = cache.get(personId)
    if (!entry) return null
    if (entry.expiresAt < Date.now()) {
      cache.delete(personId)
      return null
    }
    return entry
  }

  function setCached(personId: string, privileges: PrivilegesMap): void {
    cache.set(personId, { privileges, expiresAt: Date.now() + CACHE_TTL_MS })
  }

  function clearCache(personId?: string): void {
    if (personId) cache.delete(personId)
    else cache.clear()
  }

  async function loadPrivileges(roleCodes: string[]): Promise<PrivilegesMap> {
    if (roleCodes.length === 0) return {}

    const sb = createServerClient()

    const { data: roleRows, error: rolesErr } = await sb
      .from('roles')
      .select('id, code')
      .in('code', roleCodes as RoleCode[])

    if (rolesErr || !roleRows || roleRows.length === 0) return {}

    const roleIds = roleRows.map(r => r.id)

    const { data: privs, error: privsErr } = await sb
      .from('role_privileges')
      .select('privilege_code, scope')
      .eq('module', moduleName as PrivilegeModule)
      .in('role_id', roleIds)

    if (privsErr || !privs) return {}

    return reduceScopes<P>(privs)
  }

  async function getUserAccess(session: SessionPayload): Promise<CacheEntry> {
    const cached = getCached(session.person_id)
    if (cached) return cached

    const [rolePrivileges, personGrants] = await Promise.all([
      loadPrivileges(session.roles),
      loadPersonModuleGrants(moduleName, session.person_id),
    ])
    const privileges = applyPersonGrants<P>(rolePrivileges, personGrants)
    setCached(session.person_id, privileges)
    return { privileges, expiresAt: Date.now() + CACHE_TTL_MS }
  }

  async function hasPrivilege(session: SessionPayload | null, privilege: P): Promise<boolean> {
    if (!session) return false
    if (session.principal !== 'student' && session.roles.includes('superadmin')) return true
    const access = await getUserAccess(session)
    return !!access.privileges[privilege]
  }

  async function getPrivilegeScope(session: SessionPayload | null, privilege: P): Promise<Scope | null> {
    if (!session) return null
    if (session.principal !== 'student' && session.roles.includes('superadmin')) return 'all'
    const access = await getUserAccess(session)
    return access.privileges[privilege] ?? null
  }

  async function requirePrivilege(privilege: P): Promise<SessionPayload> {
    const session = await getSession()
    if (!session) {
      throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
    }
    const ok = await hasPrivilege(session, privilege)
    if (!ok) {
      throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
    }
    return session
  }

  return { hasPrivilege, getPrivilegeScope, requirePrivilege, clearCache }
}
