import type { SessionPayload } from '@/lib/auth/jwt'
import { canManageUnit } from '@/lib/education/unit-access'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { hasBroaderAdminRole } from '@/lib/auth/landing'

/**
 * Рабочее пространство «кафедра иудаики» (§10). Признак НЕ по строке роли, а по
 * данным: пользователь УПРАВЛЯЕТ единицей иудаики (staff_positions.is_head на
 * KODESH_DEPT_ID или делегат — это canManageUnit) И НЕ является более широким
 * админом кампуса (superadmin/campus_admin — им остаётся общий /dashboard).
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
  return canManageUnit(session, KODESH_DEPT_ID)
}
