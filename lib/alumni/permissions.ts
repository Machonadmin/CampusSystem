import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { RoleCode } from '@/types/database'

// ─── Типы ─────────────────────────────────────────────────────────────────────
//
// Тот же паттерн, что lib/education/permissions.ts, но для module='alumni'.
// Модуль «Выпускники» простой: две привилегии и по факту только scope='all'
// (данные выпускников не привязаны к подразделению). Департамент-скоуп
// сохранён для совместимости с общей моделью прав, но без target трактуется
// как «разрешено».

export type AlumniPrivilege = 'view' | 'manage'

export type Scope = 'all' | 'department' | 'own'

// ─── In-memory кэш ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000

type PrivilegesMap = Partial<Record<AlumniPrivilege, Scope>>

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
export function clearAlumniPermissionsCache(personId?: string): void {
  if (personId) cache.delete(personId)
  else cache.clear()
}

// ─── Загрузчик ────────────────────────────────────────────────────────────────

/**
 * Загружает все alumni-привилегии для массива ролей.
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
    .eq('module', 'alumni')
    .in('role_id', roleIds)

  if (privsErr || !privs) return {}

  const scopeRank: Record<Scope, number> = { all: 3, department: 2, own: 1 }
  const result: PrivilegesMap = {}

  for (const row of privs) {
    const pc = row.privilege_code as AlumniPrivilege
    const sc = row.scope as Scope
    const existing = result[pc]
    if (!existing || scopeRank[sc] > scopeRank[existing]) {
      result[pc] = sc
    }
  }
  return result
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
 * Проверяет, имеет ли пользователь привилегию модуля «Выпускники».
 * Для этого модуля данные не привязаны к подразделению, поэтому любой
 * присутствующий scope означает «разрешено».
 */
export async function hasAlumniPrivilege(
  session: SessionPayload | null,
  privilege: AlumniPrivilege,
): Promise<boolean> {
  if (!session) return false
  const access = await getUserAccess(session)
  return !!access.privileges[privilege]
}

/**
 * Получить scope, с которым у пользователя есть привилегия. null — если нет.
 */
export async function getAlumniPrivilegeScope(
  session: SessionPayload | null,
  privilege: AlumniPrivilege,
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
 *   const session = await requireAlumniPrivilege('view')
 */
export async function requireAlumniPrivilege(
  privilege: AlumniPrivilege,
): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw Object.assign(new Error('Не авторизован'), { status: 401 })
  }
  const ok = await hasAlumniPrivilege(session, privilege)
  if (!ok) {
    throw Object.assign(new Error('Недостаточно прав'), { status: 403 })
  }
  return session
}
