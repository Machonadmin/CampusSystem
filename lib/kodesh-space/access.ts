import type { SessionPayload } from '@/lib/auth/jwt'
import { hasPrivilege } from '@/lib/auth/module-privileges'

/**
 * Кто входит в модуль «מרחב יהדות» (kodesh_space). Решение владельца
 * 19.11.2026: это обычный модуль со своим правом, а не особый «дом» главы
 * кафедры иудаики. Право kodesh_space.access владелец выдаёт на экране
 * «אבטחת מידע» (по должности или лично; личный запрет сильнее). superadmin
 * проходит всегда. Видит пункт меню ⇔ может войти: этим же проверяются
 * страница, её API и список модулей в /api/auth/me.
 *
 * Экраны, на которые модуль ведёт (שיבוץ, קורסים, מורות…), по-прежнему
 * проверяют каждый своё право — этот доступ их не расширяет.
 */
export async function canEnterKodeshSpace(session: SessionPayload | null): Promise<boolean> {
  if (!session || session.principal === 'student') return false
  return hasPrivilege(session, 'kodesh_space', 'access')
}
