import type { SessionPayload } from '@/lib/auth/jwt'
import { serverT } from '@/lib/i18n/api-errors'
import { hasPrivilege } from '@/lib/auth/module-privileges'
import { requireCalendarUser } from '@/lib/calendar/permissions'

/**
 * Модули группы «ניהול שלי»: פאנל ניהול, פגישות, המסלול שלי. Решение владельца
 * 25.11.2026: раньше они были открыты любому сотруднику (самое «личное»
 * ограничение — фильтр данных в API), теперь это обычные модули со своим
 * правом '<module>.access', которое владелец выдаёт на экране «אבטחת מידע».
 * superadmin проходит всегда. Фильтры данных внутри API остаются как были:
 * право пускает в модуль, но не открывает чужого.
 */
export type PersonalModule = 'management' | 'meetings' | 'my_track'

export async function canEnterPersonalModule(
  session: SessionPayload | null,
  module: PersonalModule,
): Promise<boolean> {
  if (!session || session.principal === 'student') return false
  return hasPrivilege(session, module, 'access')
}

/** Сессия сотрудника с правом модуля, иначе 401/403 (как requireCalendarUser). */
export async function requireModuleUser(module: PersonalModule): Promise<SessionPayload> {
  const session = await requireCalendarUser()
  if (!(await canEnterPersonalModule(session, module))) {
    throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
  }
  return session
}
