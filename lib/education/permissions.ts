import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { RoleCode } from '@/types/database'
import { reduceScopes, grantsAccess, type Scope } from '@/lib/permissions/scope'

// ─── Типы ─────────────────────────────────────────────────────────────────────

export type EducationPrivilege =
  | 'manage_subjects'
  | 'manage_specialties'
  | 'manage_study_groups'
  | 'view_leads'
  | 'manage_leads'
  | 'convert_lead'
  | 'view_applicants'
  | 'manage_applicants'
  | 'enroll_applicant'
  | 'view_students'
  | 'manage_students'
  | 'manage_enrollments'
  | 'manage_class_groups'
  | 'manage_class_teachers'
  | 'mark_attendance'
  | 'set_grades'
  | 'set_lesson_topics'
  | 'manage_communities'

export type { Scope }

/**
 * Цель проверки прав. Что именно мы пытаемся сделать.
 *   - department_id: для scope='department' — в каком подразделении действие
 *   - teacher_ids: для scope='own' — массив person_id ответственных за объект
 *                  (например, class_teachers группы или teacher_id урока)
 */
export interface PrivilegeTarget {
  department_id?: string
  teacher_ids?: string[]
}

// ─── In-memory кэш ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000

type PrivilegesMap = Partial<Record<EducationPrivilege, Scope>>

interface CacheEntry {
  privileges: PrivilegesMap
  departmentIds: string[]
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

function setCached(personId: string, privileges: PrivilegesMap, departmentIds: string[]): void {
  cache.set(personId, { privileges, departmentIds, expiresAt: Date.now() + CACHE_TTL_MS })
}

/**
 * Полностью сбрасывает кэш (например, после изменения ролей пользователя).
 * Использовать с осторожностью — каждый вызов даст 2 запроса к БД на каждый персон.
 */
export function clearPermissionsCache(personId?: string): void {
  if (personId) cache.delete(personId)
  else cache.clear()
}

// ─── Загрузчики ───────────────────────────────────────────────────────────────

/**
 * Возвращает массив department_id из активных staff_positions пользователя.
 * "Активный" = end_date IS NULL OR end_date > CURRENT_DATE.
 */
export async function getUserDepartmentIds(personId: string): Promise<string[]> {
  const cached = getCached(personId)
  if (cached) return cached.departmentIds

  const sb = createServerClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await sb
    .from('staff_positions')
    .select('department_id, end_date')
    .eq('person_id', personId)

  if (error || !data) return []

  const ids = new Set<string>()
  for (const row of data) {
    if (row.end_date === null || row.end_date > today) {
      if (row.department_id) ids.add(row.department_id)
    }
  }
  return Array.from(ids)
}

/**
 * Загружает все education-привилегии для массива ролей.
 * Если одна привилегия есть у нескольких ролей с разными scope — берётся максимальный
 * (приоритет: all > department > own).
 */
async function loadPrivileges(roleCodes: string[]): Promise<PrivilegesMap> {
  if (roleCodes.length === 0) return {}

  const sb = createServerClient()

  // 1. Получить role_id для всех кодов
  const { data: roleRows, error: rolesErr } = await sb
    .from('roles')
    .select('id, code')
    .in('code', roleCodes as RoleCode[])

  if (rolesErr || !roleRows || roleRows.length === 0) return {}

  const roleIds = roleRows.map(r => r.id)

  // 2. Получить все привилегии education для этих ролей
  const { data: privs, error: privsErr } = await sb
    .from('role_privileges')
    .select('privilege_code, scope')
    .eq('module', 'education')
    .in('role_id', roleIds)

  if (privsErr || !privs) return {}

  // 3. Сложить, выбирая максимальный scope
  return reduceScopes<EducationPrivilege>(privs)
}

/**
 * Получить все привилегии пользователя + его подразделения.
 * Использует кэш.
 */
async function getUserAccess(session: SessionPayload): Promise<CacheEntry> {
  const cached = getCached(session.person_id)
  if (cached) return cached

  const [privileges, departmentIds] = await Promise.all([
    loadPrivileges(session.roles),
    getUserDepartmentIds(session.person_id),
  ])

  setCached(session.person_id, privileges, departmentIds)
  return { privileges, departmentIds, expiresAt: Date.now() + CACHE_TTL_MS }
}

// ─── Главная функция проверки прав ────────────────────────────────────────────

/**
 * Проверяет, имеет ли пользователь право выполнить действие.
 *
 * Логика:
 *   1. Если у пользователя нет такой привилегии — false
 *   2. Если scope='all' — true
 *   3. Если scope='department':
 *        - target.department_id обязателен (иначе false)
 *        - target.department_id должен быть в моих staff_positions
 *   4. Если scope='own':
 *        - target.teacher_ids обязателен (иначе false)
 *        - мой person_id должен быть в этом массиве
 *
 * Вызовы без target (например, "может ли пользователь в принципе видеть лидов?") —
 * вернут true только если scope='all'. Для проверки "может ли хоть где-то"
 * используйте canDoEducationInAny() ниже.
 */
export async function hasEducationPrivilege(
  session: SessionPayload | null,
  privilege: EducationPrivilege,
  target?: PrivilegeTarget,
): Promise<boolean> {
  if (!session) return false

  const access = await getUserAccess(session)
  const scope = access.privileges[privilege]

  return grantsAccess(scope, target, {
    departmentIds: access.departmentIds,
    personId: session.person_id,
  })
}

/**
 * "Может ли пользователь хоть где-то делать это действие".
 * Полезно для отображения вкладок/кнопок в UI без конкретной цели.
 *
 * Возвращает true если у пользователя есть эта привилегия с любым scope
 * (и для department — есть хотя бы одно подразделение, для own — он сам является person).
 */
export async function canDoEducationInAny(
  session: SessionPayload | null,
  privilege: EducationPrivilege,
): Promise<boolean> {
  if (!session) return false

  const access = await getUserAccess(session)
  const scope = access.privileges[privilege]
  if (!scope) return false

  if (scope === 'all') return true
  if (scope === 'department') return access.departmentIds.length > 0
  if (scope === 'own') return true  // own всегда применим к самому пользователю

  return false
}

/**
 * Получить scope, с которым у пользователя есть привилегия.
 * Возвращает null если привилегии нет.
 */
export async function getEducationPrivilegeScope(
  session: SessionPayload | null,
  privilege: EducationPrivilege,
): Promise<Scope | null> {
  if (!session) return null
  const access = await getUserAccess(session)
  return access.privileges[privilege] ?? null
}

// ─── Версии с throw — для использования в API endpoints ───────────────────────

/**
 * Throws 401 если не залогинен, 403 если нет прав.
 * Возвращает session при успехе.
 *
 * Пример:
 *   const session = await requireEducationPrivilege('manage_subjects', { department_id: body.department_id })
 */
export async function requireEducationPrivilege(
  privilege: EducationPrivilege,
  target?: PrivilegeTarget,
): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw Object.assign(new Error('Не авторизован'), { status: 401 })
  }
  const ok = await hasEducationPrivilege(session, privilege, target)
  if (!ok) {
    throw Object.assign(new Error('Недостаточно прав'), { status: 403 })
  }
  return session
}
