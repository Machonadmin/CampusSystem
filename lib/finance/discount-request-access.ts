import type { SessionPayload } from '@/lib/auth/jwt'
import { hasFinancePrivilege } from '@/lib/finance/permissions'
import { canManageEducationInAny } from '@/lib/education/permissions'

/**
 * Кто может ЗАПРОСИТЬ скидку на обучение (tuition_discount_approvals, POST) для
 * студентки, чья journey сидит в подразделении `journeyDepartmentId`.
 *
 * Одно место для правила: его читают и POST-маршрут, и карточка студентки
 * (показывать ли блок «בקשת הנחה»), чтобы кнопка и сервер не расходились.
 */
export async function canRequestTuitionDiscount(
  session: SessionPayload | null,
  _journeyDepartmentId: string | null,
): Promise<boolean> {
  if (!session) return false
  return (await canManageEducationInAny(session, 'manage_enrollments'))
    || (await hasFinancePrivilege(session, 'create_invoice'))
}
