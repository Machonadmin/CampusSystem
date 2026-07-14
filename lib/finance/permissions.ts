import { createServerClient } from '@/lib/supabase/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { RoleCode } from '@/types/database'
import { reduceScopes, type Scope } from '@/lib/permissions/scope'

// ─── Типы ─────────────────────────────────────────────────────────────────────
//
// Тот же паттерн, что lib/alumni/permissions.ts, но для module='finance'.
// Финансы в MVP — scope='all' (данные биллинга не привязаны к подразделению).
// Департамент-скоуп сохранён для совместимости с общей моделью прав, но без
// target трактуется как «разрешено».

export type FinancePrivilege =
  | 'view'
  | 'create_invoice'
  | 'approve_payment'
  | 'manage_budget'
  | 'export_reports'

export type { Scope }

// ─── In-memory кэш ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000

type PrivilegesMap = Partial<Record<FinancePrivilege, Scope>>

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

/** Полностью сбрасывает кэш (например, после изменения ролей пользователя). */
export function clearFinancePermissionsCache(personId?: string): void {
  if (personId) cache.delete(personId)
  else cache.clear()
}

// ─── Загрузчик ────────────────────────────────────────────────────────────────

/**
 * Загружает все finance-привилегии для массива ролей.
 * Если привилегия есть у нескольких ролей с разным scope — берётся максимальный
 * (приоритет: all > department > own).
 */
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
    .eq('module', 'finance')
    .in('role_id', roleIds)

  if (privsErr || !privs) return {}

  return reduceScopes<FinancePrivilege>(privs)
}

async function getUserAccess(session: SessionPayload): Promise<CacheEntry> {
  const cached = getCached(session.person_id)
  if (cached) return cached

  const privileges = await loadPrivileges(session.roles)
  setCached(session.person_id, privileges)
  return { privileges, expiresAt: Date.now() + CACHE_TTL_MS }
}

// ─── Проверки прав ────────────────────────────────────────────────────────────

/**
 * Проверяет, имеет ли пользователь привилегию модуля «Финансы».
 * Для этого модуля данные не привязаны к подразделению, поэтому любой
 * присутствующий scope означает «разрешено».
 */
export async function hasFinancePrivilege(
  session: SessionPayload | null,
  privilege: FinancePrivilege,
): Promise<boolean> {
  if (!session) return false
  const access = await getUserAccess(session)
  const scope = access.privileges[privilege]
  if (!scope) return false
  // Модуль не привязан к подразделению/владельцу: 'all'/'department' дают доступ,
  // 'own' здесь бессмыслен и НЕ должен по ошибке открыть все финансовые данные.
  return scope !== 'own'
}

/**
 * Получить scope, с которым у пользователя есть привилегия. null — если нет.
 */
export async function getFinancePrivilegeScope(
  session: SessionPayload | null,
  privilege: FinancePrivilege,
): Promise<Scope | null> {
  if (!session) return null
  const access = await getUserAccess(session)
  return access.privileges[privilege] ?? null
}

// ─── Версии с throw — для API endpoints ───────────────────────────────────────

/**
 * Throws 401 если не залогинен, 403 если нет прав. Возвращает session при успехе.
 *
 * Пример:
 *   const session = await requireFinancePrivilege('view')
 */
export async function requireFinancePrivilege(
  privilege: FinancePrivilege,
): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  }
  const ok = await hasFinancePrivilege(session, privilege)
  if (!ok) {
    throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
  }
  return session
}
