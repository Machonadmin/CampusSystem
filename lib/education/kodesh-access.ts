import type { SessionPayload } from '@/lib/auth/jwt'
import { canManageUnit } from '@/lib/education/unit-access'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'

/**
 * Доступ к УПРАВЛЕНИЮ кафедрой иудаики (кодеш): глава кафедры/делегат
 * (canManageUnit — сюда же попадает superadmin) ИЛИ менеджер с правом
 * manage_enrollments / manage_class_groups, выданным на саму кафедру.
 *
 * Единый источник: раньше эта функция была побайтово скопирована в трёх
 * роутах кодеша (home / assignment / suggest), и изменение правила доступа
 * пришлось бы вносить трижды — либо они бы разъехались.
 */
export async function canManageKodesh(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false
  if (await canManageUnit(session, KODESH_DEPT_ID)) return true
  const target = { department_id: KODESH_DEPT_ID }
  return (await hasEducationPrivilege(session, 'manage_enrollments', target))
    || (await hasEducationPrivilege(session, 'manage_class_groups', target))
}
