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
 * Fail-closed: любая ошибка чтения → пустое множество. Последствие — галочка
 * «задача по эксплуатации» не появится и флаг не сохранится; это лучше, чем
 * ошибочно опубликовать чужую задачу на доске техслужбы.
 */
export async function maintenanceStaffPersonIds(sb: SB): Promise<Set<string>> {
  const { data: roleRows, error: rolesErr } = await sb
    .from('roles')
    .select('id')
    .in('code', MAINTENANCE_ROLE_CODES as unknown as RoleCode[])
  if (rolesErr || !roleRows || roleRows.length === 0) return new Set()

  const { data: personRows, error: prErr } = await sb
    .from('person_roles')
    .select('person_id')
    .in('role_id', roleRows.map(r => r.id))
  if (prErr || !personRows) return new Set()

  return new Set(personRows.map(r => r.person_id).filter(Boolean) as string[])
}

/** Один человек: удобная обёртка над maintenanceStaffPersonIds. */
export async function isMaintenancePerson(sb: SB, personId: string | null | undefined): Promise<boolean> {
  if (!personId) return false
  return (await maintenanceStaffPersonIds(sb)).has(personId)
}
