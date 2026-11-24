import type { SessionPayload } from '@/lib/auth/jwt'
import { createServerClient } from '@/lib/supabase/server'
import { managedOwnerIds } from '@/lib/meetings/access'
import { serverT } from '@/lib/i18n/api-errors'
import { hasFinancePrivilege } from '@/lib/finance/permissions'
import { canDoEducationInAny } from '@/lib/education/permissions'
import { directorSpaceRole, type DirectorSpaceRole, type InboxCategory } from './rules'

// ─── «מרחב המנהל»: кто входит (читает БД) ────────────────────────────────────
//
// Решение владельца 24.11.2026: המנהל = человек с ролью superadmin. מזכירת
// המנהל — тот, кто ведёт календарь המנהל (calendar_delegates вручную или по
// должности «מזכירת המנהל», см. lib/meetings/access.ts). Больше никто не входит:
// остальные утверждающие продолжают работать на своих экранах.

type SB = ReturnType<typeof createServerClient>

/** person_id всех, у кого роль superadmin. */
export async function superadminPersonIds(sb: SB): Promise<string[]> {
  const { data: role } = await sb.from('roles').select('id').eq('code', 'superadmin').maybeSingle()
  if (!role) return []
  const { data } = await sb.from('person_roles').select('person_id').eq('role_id', (role as { id: string }).id)
  return [...new Set(((data ?? []) as Array<{ person_id: string }>).map(r => r.person_id))]
}

export interface DirectorSpaceAccess {
  role: DirectorSpaceRole
  /** Чьи заявки на встречу показывать: свои (המנהל) или руководителей, чей календарь веду. */
  directorIds: string[]
}

export async function directorSpaceAccess(sb: SB, session: SessionPayload): Promise<DirectorSpaceAccess | null> {
  if (session.principal === 'student') return null
  const isSuperadmin = session.roles.includes('superadmin')
  if (isSuperadmin) return { role: 'director', directorIds: [session.person_id] }
  const [managed, superadmins] = await Promise.all([
    managedOwnerIds(sb, session.person_id),
    superadminPersonIds(sb),
  ])
  const role = directorSpaceRole({ isSuperadmin, managedOwnerIds: managed, superadminIds: superadmins })
  if (!role) return null
  const sa = new Set(superadmins)
  return { role, directorIds: managed.filter(id => sa.has(id)) }
}

/** Бросает 403, если человек не המנהל и не его секретарь. */
export async function requireDirectorSpaceAccess(sb: SB, session: SessionPayload): Promise<DirectorSpaceAccess> {
  const access = await directorSpaceAccess(sb, session)
  if (!access) throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
  return access
}

/**
 * В каких категориях человеку показывать кнопки «אשר / דחה». Это ТОЛЬКО
 * подсказка экрану: решает всё равно исходный маршрут со своей проверкой.
 * המנהל (superadmin) — везде. Секретарь — там, где у неё уже есть то же право,
 * что требует исходный экран (выдаёт המנהל на «אבטחת מידע»).
 */
export async function decidableCategories(session: SessionPayload, access: DirectorSpaceAccess): Promise<InboxCategory[]> {
  const withButtons: InboxCategory[] = ['schedule_slot', 'discount', 'payment', 'teacher_attendance', 'meeting_request']
  if (access.role === 'director') return withButtons
  const out: InboxCategory[] = []
  // schedule_slot — сегодня решает ТОЛЬКО superadmin (decision/route.ts).
  if (await hasFinancePrivilege(session, 'approve_discount')) out.push('discount')
  if (await hasFinancePrivilege(session, 'approve_payment')) out.push('payment')
  if (await canDoEducationInAny(session, 'manage_students')) out.push('teacher_attendance')
  // Заявки на встречу секретарь ведёт уже сегодня (lib/meetings/requests.ts).
  if (access.directorIds.length > 0) out.push('meeting_request')
  return out
}
