import { hasPrivilege } from '@/lib/auth/module-privileges'
import { createServerClient } from '@/lib/supabase/server'
import type { SessionPayload } from '@/lib/auth/jwt'

/**
 * «חבר ליומן גוגל» — кому можно подключать личный календарь к Google.
 *
 * Право calendar.google_sync выдаёт владелец людям сам на экране «אבטחת מידע»
 * (решение владельца 2026-11-09). По умолчанию его нет ни у кого; superadmin
 * проходит всегда (hasPrivilege). Сам календарь в приложении это право НЕ
 * закрывает — он по-прежнему открыт каждому сотруднику (requireCalendarUser).
 */
export const GOOGLE_SYNC_MODULE = 'calendar' as const
export const GOOGLE_SYNC_PRIVILEGE = 'google_sync'

/** Может ли вошедший сотрудник получить ссылку на подписку Google. */
export async function canUseGoogleCalendar(session: SessionPayload | null): Promise<boolean> {
  if (!session || session.principal === 'student') return false
  return hasPrivilege(session, GOOGLE_SYNC_MODULE, GOOGLE_SYNC_PRIVILEGE)
}

/**
 * То же для публичного фида: там нет сессии, есть только person_id из токена.
 * Роли берём ТЕКУЩИЕ из person_roles — так снятие права (или должности)
 * останавливает обновление календаря в Google (решение владельца 2026-11-09:
 * «גוגל מפסיק להתעדכן»).
 *
 * Возвращает null, если база не ответила (вызвающий отдаёт 503, а не 404).
 */
export async function personCanUseGoogleCalendar(personId: string): Promise<boolean | null> {
  try {
    const sb = createServerClient()
    const { data: prRows, error } = await sb.from('person_roles').select('role_id').eq('person_id', personId)
    if (error) return null
    const roleIds = ((prRows ?? []) as { role_id: string }[]).map(r => r.role_id)
    let roles: string[] = []
    if (roleIds.length > 0) {
      const { data: roleRows, error: rErr } = await sb.from('roles').select('code').in('id', roleIds)
      if (rErr) return null
      roles = ((roleRows ?? []) as { code: string }[]).map(r => r.code)
    }
    const session = { person_id: personId, login_email: '', full_name: null, roles, principal: 'staff' } as SessionPayload
    return await hasPrivilege(session, GOOGLE_SYNC_MODULE, GOOGLE_SYNC_PRIVILEGE)
  } catch {
    return null
  }
}
