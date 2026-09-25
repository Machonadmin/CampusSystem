import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionPayload } from '@/lib/auth/jwt'
import { getPersonsPrivilegeScope } from '@/lib/persons/permissions'
import { getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'
import { journeyScopeDepartment } from '@/lib/education/journey-target'

/**
 * Можно ли привязать встречу календаря к journey (appointments.journey_id).
 *
 * Раньше journey_id принимался без проверки (red-team 2026-09-25): любой
 * сотрудник подставлял чужой journey_id — встреча попадала в календарь
 * студентки, а в ответе возвращалось её имя. Теперь — как видит сотрудник
 * студентку в остальной системе:
 *   • superadmin / persons.view со scope='all' → да;
 *   • view_students='all' → да;
 *   • view_students='department' → journey должна быть в его подразделениях
 *     (journey без подразделения — нет);
 *   • view_students='own' (преподаватель) → студентка учится в его группе.
 */
export async function canLinkJourney(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  session: SessionPayload,
  journeyId: string,
): Promise<boolean> {
  if (session.principal === 'student') return false
  if (session.roles.includes('superadmin')) return true
  if ((await getPersonsPrivilegeScope(session, 'view')) === 'all') return true

  const scope = await getEducationPrivilegeScope(session, 'view_students')
  if (!scope) return false

  const { data: j, error } = await sb
    .from('education_journeys')
    .select('id, education_status, primary_department_id, desired_department_id')
    .eq('id', journeyId)
    .maybeSingle()
  if (error) throw error
  if (!j) return false
  if (scope === 'all') return true

  if (scope === 'department') {
    const dept = journeyScopeDepartment(j as Parameters<typeof journeyScopeDepartment>[0])
    if (!dept) return false
    return (await getUserDepartmentIds(session.person_id)).includes(dept)
  }

  // own: студентка в одной из групп преподавателя.
  const { data: ct } = await sb.from('class_teachers').select('class_group_id').eq('teacher_id', session.person_id)
  const groupIds = [...new Set((ct ?? []).map((r: { class_group_id: string }) => r.class_group_id))]
  if (groupIds.length === 0) return false
  const { data: enr } = await sb.from('class_enrollments')
    .select('journey_id').eq('journey_id', journeyId).in('class_group_id', groupIds).limit(1)
  return (enr ?? []).length > 0
}
