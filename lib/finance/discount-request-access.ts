import type { SessionPayload } from '@/lib/auth/jwt'
import { getUserDepartmentIds } from '@/lib/education/permissions'

/**
 * Кто может ЗАПРОСИТЬ скидку на обучение (tuition_discount_approvals, POST) для
 * студентки, чья journey сидит в подразделении `journeyDepartmentId`
 * (education_journeys.primary_department_id).
 *
 * Одно место для правила: его читают и POST-маршрут, и карточка студентки
 * (показывать ли блок «בקשת הנחה»), чтобы кнопка и сервер не расходились.
 *
 * Правило владельца (2026-09-25): запрос идёт ТОЛЬКО от секретариата учёбы,
 * никогда от студентки.
 *   • токен портала студентки (principal='student') — всегда нет, даже если тот
 *     же person где-то оформлен сотрудником (портальная изоляция);
 *   • superadmin — да;
 *   • иначе — роль studies_secretary И активная посадка (staff_positions) в
 *     подразделении journey или в его ПРЕДКЕ. getUserDepartmentIds уже
 *     разворачивает посадку вниз по дереву (посаженный в узел видит под-единицы),
 *     поэтому «journey-юнит ∈ мои юниты» = «сижу в нём или выше».
 *
 * ⚠ Роли в системе глобальные (person_roles), а не «роль в юните»: «секретарь
 * юнита» = роль studies_secretary + посадка в юните — так же состав единицы
 * считает секретарей (education/units/[unitId]/members). Journey без
 * подразделения — запросить может только superadmin.
 */
export async function canRequestTuitionDiscount(
  session: SessionPayload | null,
  journeyDepartmentId: string | null,
): Promise<boolean> {
  if (!session) return false
  if (session.principal === 'student') return false
  if (session.roles.includes('superadmin')) return true
  if (!session.roles.includes('studies_secretary')) return false
  if (!journeyDepartmentId) return false
  const seated = await getUserDepartmentIds(session.person_id)
  return seated.includes(journeyDepartmentId)
}
