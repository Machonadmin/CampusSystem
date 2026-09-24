import type { SessionPayload } from '@/lib/auth/jwt'
import { createServerClient } from '@/lib/supabase/server'
import { canManageUnit, getHeadedUnitIds } from '@/lib/education/unit-access'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { hasBroaderAdminRole } from '@/lib/auth/landing'

type DeptLink = { id: string; parent_id: string | null }

/**
 * Все ли возглавляемые единицы — кодеш (сама кафедра иудаики или её потомки).
 * Чистая функция: headIds — единицы, где человек глава; depts — дерево
 * departments (id → parent_id). Пустой headIds → true (делегат кодеша без
 * собственного главенства — тоже «только кодеш»).
 */
export function headsOnlyKodeshUnits(headIds: string[], depts: DeptLink[]): boolean {
  const parentOf = new Map(depts.map(d => [d.id, d.parent_id]))
  const underKodesh = (id: string): boolean => {
    const seen = new Set<string>()
    let cur: string | null | undefined = id
    while (cur && !seen.has(cur)) {
      if (cur === KODESH_DEPT_ID) return true
      seen.add(cur)
      cur = parentOf.get(cur)
    }
    return false
  }
  return headIds.every(underKodesh)
}

/**
 * Возглавляет ли человек ТОЛЬКО кодеш (решение владельца 24.09.2026: «מרחב הקודש»
 * — только для того, кто отвечает за кодеш и ни за что больше). Глава кодеша,
 * который возглавляет и другие единицы (директор института), получает общее
 * пространство и видит светские учёбы. Fail-safe: ошибка чтения дерева → false
 * (общее пространство; доступ при этом не сужается).
 */
export async function headsOnlyKodesh(personId: string): Promise<boolean> {
  const heads = await getHeadedUnitIds(personId)
  const others = heads.filter(id => id !== KODESH_DEPT_ID)
  if (others.length === 0) return true
  try {
    const sb = createServerClient()
    const { data, error } = await sb.from('departments').select('id, parent_id')
    if (error) return false
    return headsOnlyKodeshUnits(others, (data ?? []) as DeptLink[])
  } catch {
    return false
  }
}

/**
 * Рабочее пространство «кафедра иудаики» (§10). Признак НЕ по строке роли, а по
 * данным: пользователь УПРАВЛЯЕТ единицей иудаики (staff_positions.is_head на
 * KODESH_DEPT_ID или делегат — это canManageUnit), НЕ возглавляет других
 * (некодешных) единиц и НЕ является более широким админом кампуса (superadmin —
 * ему остаётся общий /dashboard).
 *
 * Используется и для посадки (Part A), и для сфокусированного сайдбара (Part B),
 * чтобы обе части опирались на ОДИН сигнал. Fail-safe: студентка/ошибка → false
 * (общее пространство), доступ при этом не сужается.
 */
export async function isKodeshDepartmentWorkspace(session: SessionPayload | null): Promise<boolean> {
  if (!session || session.principal === 'student') return false
  // Широкий админ кампуса — общий рабочий стол (даже если где-то оформлен главой).
  if (hasBroaderAdminRole(session.roles)) return false
  // canManageUnit коротко возвращает true для superadmin — но он уже отсеян выше,
  // поэтому здесь это именно глава/делегат единицы иудаики.
  if (!(await canManageUnit(session, KODESH_DEPT_ID))) return false
  // Возглавляет ещё и другие единицы → общее пространство.
  return headsOnlyKodesh(session.person_id)
}
