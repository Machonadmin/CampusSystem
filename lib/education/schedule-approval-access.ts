import type { SessionPayload } from '@/lib/auth/jwt'
import { canDoEducationInAny } from '@/lib/education/permissions'

/**
 * Кто утверждает новый час в расписании на зарезервированное время кодеш.
 * Было: ТОЛЬКО מנהל כללי (superadmin). С 24.11.2026 (решение владельца,
 * «מרחב המנהל» шаг 3) — ещё и тот, кому выдано узкое право
 * studies.approve_schedule_slots («אישור שעות במערכת»). Само это право
 * больше ничего не открывает.
 */
export async function canDecideScheduleSlots(session: SessionPayload): Promise<boolean> {
  if (session.roles.includes('superadmin')) return true
  return canDoEducationInAny(session, 'approve_schedule_slots')
}
