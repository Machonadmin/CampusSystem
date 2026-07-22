import type { SessionPayload } from '@/lib/auth/jwt'

// ─── Self-gate портала студентки ─────────────────────────────────────────────
//
// Студентка (principal='student') видит ТОЛЬКО свою journey. Единый источник
// правды для проверки «этот journey — её»: раньше строка
// `principal==='student' && student_journey_id===id` дублировалась по роутам.
// Централизация нужна, чтобы бидуд (изоляция A от B) был протестирован в одном
// месте и не «поехал» при копипасте.

/**
 * true ТОЛЬКО если сессия — студенческая И запрошенный journeyId совпадает с её
 * собственным student_journey_id. Для staff/gost/чужой journey — false.
 */
export function isOwnStudentJourney(
  session: Pick<SessionPayload, 'principal' | 'student_journey_id'> | null | undefined,
  journeyId: string | null | undefined,
): boolean {
  if (!session || !journeyId) return false
  return session.principal === 'student' && session.student_journey_id === journeyId
}
