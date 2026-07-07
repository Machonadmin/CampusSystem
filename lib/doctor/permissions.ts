import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { RoleCode } from '@/types/database'
import { reduceScopes, type Scope } from '@/lib/permissions/scope'

// ─── Типы ─────────────────────────────────────────────────────────────────────
//
// Тот же паттерн, что lib/food/permissions.ts и lib/maintenance/permissions.ts,
// но для module='doctor' и с общим reduceScopes из lib/permissions/scope.ts.
// Две привилегии; данные не привязаны к подразделению, поэтому в MVP по факту
// scope='all' (любой scope без target трактуется как «разрешено»).
//
// ЧУВСТВИТЕЛЬНЫЕ МЕДИЦИНСКИЕ ДАННЫЕ: каждый маршрут API обязан проходить
// requireDoctorPrivilege('view' | 'manage').

export type DoctorPrivilege = 'view' | 'manage'
export type { Scope }

// ─── In-memory кэш ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000

type PrivilegesMap = Partial<Record<DoctorPrivilege, Scope>>

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
export function clearDoctorPermissionsCache(personId?: string): void {
  if (personId) cache.delete(personId)
  else cache.clear()
}

// ─── Загрузчик ────────────────────────────────────────────────────────────────

/**
 * Загружает все doctor-привилегии для массива ролей. Если привилегия есть
 * у нескольких ролей с разным scope — берётся максимальный (all > department > own).
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
    .eq('module', 'doctor')
    .in('role_id', roleIds)

  if (privsErr || !privs) return {}

  return reduceScopes<DoctorPrivilege>(privs)
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
 * Проверяет, есть ли у пользователя привилегия модуля «Медпункт».
 * Данные не привязаны к подразделению, поэтому любой присутствующий scope
 * означает «разрешено».
 */
export async function hasDoctorPrivilege(
  session: SessionPayload | null,
  privilege: DoctorPrivilege,
): Promise<boolean> {
  if (!session) return false
  const access = await getUserAccess(session)
  return !!access.privileges[privilege]
}

/** Получить scope, с которым у пользователя есть привилегия. null — если нет. */
export async function getDoctorPrivilegeScope(
  session: SessionPayload | null,
  privilege: DoctorPrivilege,
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
 *   const session = await requireDoctorPrivilege('view')
 */
export async function requireDoctorPrivilege(
  privilege: DoctorPrivilege,
): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw Object.assign(new Error('Не авторизован'), { status: 401 })
  }
  const ok = await hasDoctorPrivilege(session, privilege)
  if (!ok) {
    throw Object.assign(new Error('Недостаточно прав'), { status: 403 })
  }
  return session
}
