import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { RoleCode } from '@/types/database'
import { reduceScopes, type Scope } from '@/lib/permissions/scope'

// ─── Типы ─────────────────────────────────────────────────────────────────────
//
// Тот же паттерн, что lib/contacts/permissions.ts: module='persons', две
// привилегии, общий reduceScopes из lib/permissions/scope.ts. Справочник людей
// не привязан к подразделению (роль ищет любого человека), поэтому в MVP любой
// присутствующий scope трактуется как «разрешено».
//
// ВАЖНО: справочник ЧИТАЮЩИЙ — каждый маршрут API проходит только
// requirePersonsPrivilege('view'). 'manage' объявлена для полноты/совместимости
// с каталогом, но API её не требует.

export type PersonsPrivilege = 'view' | 'manage' | 'view_sensitive'
export type { Scope }

// ─── In-memory кэш ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000

type PrivilegesMap = Partial<Record<PersonsPrivilege, Scope>>

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
export function clearPersonsPermissionsCache(personId?: string): void {
  if (personId) cache.delete(personId)
  else cache.clear()
}

// ─── Загрузчик ────────────────────────────────────────────────────────────────

/**
 * Загружает все persons-привилегии для массива ролей. Если привилегия есть у
 * нескольких ролей с разным scope — берётся максимальный (all > department > own).
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
    .eq('module', 'persons')
    .in('role_id', roleIds)

  if (privsErr || !privs) return {}

  return reduceScopes<PersonsPrivilege>(privs)
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
 * Проверяет, есть ли у пользователя привилегия модуля «Люди».
 * Справочник не привязан к подразделению, поэтому любой присутствующий scope
 * означает «разрешено».
 */
export async function hasPersonsPrivilege(
  session: SessionPayload | null,
  privilege: PersonsPrivilege,
): Promise<boolean> {
  if (!session) return false
  const access = await getUserAccess(session)
  return !!access.privileges[privilege]
}

/** Получить scope, с которым у пользователя есть привилегия. null — если нет. */
export async function getPersonsPrivilegeScope(
  session: SessionPayload | null,
  privilege: PersonsPrivilege,
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
 *   const session = await requirePersonsPrivilege('view')
 */
export async function requirePersonsPrivilege(
  privilege: PersonsPrivilege,
): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw Object.assign(new Error('Не авторизован'), { status: 401 })
  }
  const ok = await hasPersonsPrivilege(session, privilege)
  if (!ok) {
    throw Object.assign(new Error('Недостаточно прав'), { status: 403 })
  }
  return session
}
