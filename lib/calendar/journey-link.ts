import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionPayload } from '@/lib/auth/jwt'
import { getPersonsPrivilegeScope } from '@/lib/persons/permissions'
import { getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'
import { journeyScopeDepartment } from '@/lib/education/journey-target'
import { subjectsBelow } from '@/lib/org/hierarchy'
import { todayISO } from '@/lib/dates'

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

/**
 * Кого можно пригласить участником встречи (appointment_attendees).
 *
 * Раньше — любой person_id без проверки (red-team 2026-09-25): подставив чужой
 * uuid, сотрудник получал в ответе его имя и вставлял событие в его календарь.
 * Теперь участник допустим, если:
 *   • superadmin или persons.view со scope='all';
 *   • он действующий сотрудник (коллег приглашать можно всем штатным);
 *   • у него есть journey, которую пользователь может привязать (canLinkJourney).
 * Возвращает id, которые приглашать НЕЛЬЗЯ (пусто — всё в порядке).
 */
export async function forbiddenAttendees(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  session: SessionPayload,
  personIds: string[],
): Promise<string[]> {
  const ids = [...new Set(personIds)]
  if (ids.length === 0) return []
  if (session.principal === 'student') return ids
  if (session.roles.includes('superadmin')) return []
  if ((await getPersonsPrivilegeScope(session, 'view')) === 'all') return []

  const today = todayISO()
  const { data: pos, error: pErr } = await sb.from('staff_positions').select('person_id, end_date').in('person_id', ids)
  if (pErr) throw pErr
  const staff = new Set(((pos ?? []) as Array<{ person_id: string; end_date: string | null }>)
    .filter(p => p.end_date === null || p.end_date > today).map(p => p.person_id))

  const rest = ids.filter(id => !staff.has(id))
  if (rest.length === 0) return []
  const { data: js, error: jErr } = await sb.from('education_journeys').select('id, person_id').in('person_id', rest)
  if (jErr) throw jErr
  const ok = new Set<string>()
  for (const j of (js ?? []) as Array<{ id: string; person_id: string }>) {
    if (ok.has(j.person_id)) continue
    if (await canLinkJourney(sb, session, j.id)) ok.add(j.person_id)
  }
  return rest.filter(id => !ok.has(id))
}

/**
 * Участники, стоящие ВЫШЕ создателя по иерархии (их участие требует
 * подтверждения). Раньше вызывался subjectsBelow(создатель, участники) — это
 * участники НИЖЕ создателя, т.е. логика была перевёрнута.
 */
export async function attendeesAbove(creatorPersonId: string, attendeeIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (const pid of new Set(attendeeIds)) {
    if ((await subjectsBelow(pid, [creatorPersonId])).has(creatorPersonId)) out.add(pid)
  }
  return out
}
