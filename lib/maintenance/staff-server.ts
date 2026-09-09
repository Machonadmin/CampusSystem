import type { createServerClient } from '@/lib/supabase/server'
import type { RoleCode } from '@/types/database'
import { MAINTENANCE_ROLE_CODES } from '@/lib/tasks/maintenance-link'

type SB = ReturnType<typeof createServerClient>

/**
 * person_id всех, у кого в настройках стоит роль техслужбы
 * (maintenance_head / maintenance_staff).
 *
 * Это единственный признак «человек из техслужбы» во всей связке задач и
 * эксплуатации: роль выдаётся осознанно в «Настройки → Пользователи и права»,
 * в отличие от места в штатном расписании, куда человек может попасть по
 * административным причинам, не будучи техником.
 *
 * Возвращает NULL, если состав техслужбы установить НЕ УДАЛОСЬ (ошибка чтения),
 * и пустое множество, если ролей просто ни у кого нет. Разница принципиальна:
 *   • при ВЫДАЧЕ метки null трактуется как «нельзя» (fail-closed — лучше не
 *     поставить метку, чем выложить чужую задачу на доску техслужбы);
 *   • при ПЕРЕПРОВЕРКЕ уже помеченной задачи null означает «не знаю» и метку
 *     трогать нельзя — иначе разовый сбой запроса СТИРАЛ бы метку у живой
 *     задачи (например при массовом переназначении), и восстановить её пришлось
 *     бы вручную.
 * Раньше оба случая давали пустое множество, и второй сценарий был разрушающим.
 */
export async function maintenanceStaffPersonIds(sb: SB): Promise<Set<string> | null> {
  const { data: roleRows, error: rolesErr } = await sb
    .from('roles')
    .select('id')
    .in('code', MAINTENANCE_ROLE_CODES as unknown as RoleCode[])
  if (rolesErr) return null
  // Ролей нет вовсе (не заведены/удалены) — это ответ «никто», а не сбой.
  if (!roleRows || roleRows.length === 0) return new Set()

  const { data: personRows, error: prErr } = await sb
    .from('person_roles')
    .select('person_id')
    .in('role_id', roleRows.map(r => r.id))
  if (prErr || !personRows) return null

  return new Set(personRows.map(r => r.person_id).filter(Boolean) as string[])
}
