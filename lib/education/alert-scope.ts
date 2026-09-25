import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionPayload } from '@/lib/auth/jwt'
import { getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'
import { journeyScopeDepartment } from '@/lib/education/journey-target'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>

/**
 * Какие студентки (student_alerts.student_id = person_id) видны пользователю в
 * оповещениях. Раньше право view_students/manage_alerts в ОДНОМ юните открывало
 * оповещения всего института (red-team 2026-09-25: поведенческие/рядом с
 * благополучием флаги несовершеннолетних).
 *
 * Возвращает:
 *   • null — без ограничения (superadmin, либо view_students/manage_alerts = 'all');
 *   • Set person_id — студентки подразделений пользователя (scope 'department')
 *     и/или его групп (scope 'own'). Пустой Set — ничего.
 */
export async function getAlertStudentScope(sb: Sb, session: SessionPayload): Promise<Set<string> | null> {
  if (session.principal === 'student') return new Set()
  if (session.roles.includes('superadmin')) return null
  const [viewScope, manageScope] = await Promise.all([
    getEducationPrivilegeScope(session, 'view_students'),
    getEducationPrivilegeScope(session, 'manage_alerts'),
  ])
  if (viewScope === 'all' || manageScope === 'all') return null

  const out = new Set<string>()
  if (viewScope === 'department' || manageScope === 'department') {
    const depts = await getUserDepartmentIds(session.person_id)
    if (depts.length > 0) {
      const orFilter = `primary_department_id.in.(${depts.join(',')}),desired_department_id.in.(${depts.join(',')})`
      const { data, error } = await sb.from('education_journeys')
        .select('person_id, education_status, primary_department_id, desired_department_id')
        .or(orFilter)
      if (error) throw error
      for (const j of (data ?? []) as Array<{ person_id: string; education_status: string | null; primary_department_id: string | null; desired_department_id: string | null }>) {
        const d = journeyScopeDepartment(j)
        if (d && depts.includes(d)) out.add(j.person_id)
      }
    }
  }
  if (viewScope === 'own' || manageScope === 'own') {
    const { data: ct } = await sb.from('class_teachers').select('class_group_id').eq('teacher_id', session.person_id)
    const groupIds = [...new Set((ct ?? []).map((r: { class_group_id: string }) => r.class_group_id))]
    if (groupIds.length > 0) {
      const { data: enr } = await sb.from('class_enrollments').select('journey_id').in('class_group_id', groupIds)
      const jids = [...new Set((enr ?? []).map((r: { journey_id: string }) => r.journey_id))]
      if (jids.length > 0) {
        const { data: js } = await sb.from('education_journeys').select('person_id').in('id', jids)
        for (const j of (js ?? []) as Array<{ person_id: string }>) out.add(j.person_id)
      }
    }
  }
  return out
}
