import { hasPrivilege } from '@/lib/auth/module-privileges'
import type { SessionPayload } from '@/lib/auth/jwt'

/**
 * Кто видит кнопку «הצעה לשיפור או באג» и может отправлять замечания:
 * сотрудник (не студенческий портал) с правом feedback.submit — его владелец
 * выдаёт людям сам. superadmin проходит всегда (hasPrivilege).
 */
export async function canSubmitFeedback(session: SessionPayload | null): Promise<boolean> {
  if (!session || session.principal === 'student') return false
  return hasPrivilege(session, 'feedback', 'submit')
}

/** Все замечания и смену статуса на сайте видит только владелец (superadmin). */
export function isFeedbackOwner(session: SessionPayload | null): boolean {
  return !!session && session.principal !== 'student' && session.roles.includes('superadmin')
}
