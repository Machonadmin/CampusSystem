import { apiError } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'

/**
 * БЫВШИЙ маршрут правки личных прав (person_privileges) из «Настроек».
 *
 * Решение владельца: права редактируются ТОЛЬКО в «אבטחת מידע»
 * (/dashboard/data-security → PUT /api/data-security/person/[personId]).
 * Старый PUT удалял ВСЕ строки человека и вставлял заново — вместе с ними
 * пропадали срок действия, причина и «кто выдал». Экран, который его вызывал
 * (PersonPrivilegesModal), удалён ещё раньше (коммит ddc682ac).
 *
 * GET тоже убран: его никто не читал. Запись отвечает 410 Gone с понятным
 * сообщением — на случай старой вкладки браузера или внешнего скрипта.
 * Проверка superadmin (как была) оставлена, чтобы маршрут не отвечал
 * посторонним иначе, чем раньше (и страж lib/api/route-authorization.test.ts).
 */
async function gone() {
  const session = await getSession()
  if (!session) return apiError('unauthorized', 401)
  if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)
  return apiError('person_privileges_moved', 410, { redirect_to: '/dashboard/data-security' })
}

export async function PUT() {
  return gone()
}

export async function POST() {
  return gone()
}
