import type { SessionPayload } from '@/lib/auth/jwt'
import { canViewStaffComp, canManageStaffComp } from '@/lib/finance/staff-comp'
import { canDoEducationInAny } from '@/lib/education/permissions'

// ─── Доступ к «מרכז חברותא» (управление хаврутой в модуле «Лимудим») ──────────
//
// По решению владельца хаврута-шиюх — учебная (не зарплатная), поэтому хабом
// пользуется НЕ только ответственный за зарплаты (staff-comp), но и אחראי
// לימודים (manage_students). Право = staff-comp ЛИБО manage_students (любой
// scope). superadmin проходит через оба.

export async function canViewChavruta(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false
  if (await canViewStaffComp(session)) return true
  return canDoEducationInAny(session, 'manage_students')
}

export async function canManageChavruta(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false
  if (await canManageStaffComp(session)) return true
  return canDoEducationInAny(session, 'manage_students')
}
