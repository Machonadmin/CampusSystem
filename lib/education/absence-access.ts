import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionPayload } from '@/lib/auth/jwt'
import { getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'
import { journeyScopeDepartment } from '@/lib/education/journey-target'

/**
 * Видимость случаев отсутствия (absence_cases).
 *
 * Раньше «менеджером» (видит и правит ВСЕ случаи института) считался любой с
 * manage_students — даже ограниченный одним юнитом (red-team 2026-09-25).
 * Теперь:
 *   • superadmin / manage_students со scope='all' → все случаи;
 *   • остальные → случаи, переданные их подразделениям (assigned_department_id),
 *     плюс — для manage_students со scope='department' — случаи студенток их
 *     подразделений (подразделение journey).
 */
export interface AbsenceAccess {
  all: boolean
  /** Может открывать/вести случаи своих студенток (manage_students, scope department). */
  deptManager: boolean
  depts: string[]
}

export async function getAbsencePrivilegeScope(session: SessionPayload): Promise<AbsenceAccess> {
  if (session.principal === 'student') return { all: false, deptManager: false, depts: [] }
  if (session.roles.includes('superadmin')) return { all: true, deptManager: true, depts: [] }
  const scope = await getEducationPrivilegeScope(session, 'manage_students')
  if (scope === 'all') return { all: true, deptManager: true, depts: [] }
  const depts = await getUserDepartmentIds(session.person_id)
  return { all: false, deptManager: scope === 'department', depts }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>

/** Подразделение каждой journey (journeyScopeDepartment); отсутствующие — null. */
export async function journeyDepartments(sb: Sb, journeyIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const ids = [...new Set(journeyIds)]
  if (ids.length === 0) return out
  const { data, error } = await sb
    .from('education_journeys')
    .select('id, education_status, primary_department_id, desired_department_id')
    .in('id', ids)
  if (error) throw error
  for (const j of (data ?? []) as Array<{ id: string; education_status: string | null; primary_department_id: string | null; desired_department_id: string | null }>) {
    out.set(j.id, journeyScopeDepartment(j))
  }
  return out
}

/** Виден ли случай пользователю (чистая функция). */
export function canSeeAbsence(
  access: AbsenceAccess,
  row: { assigned_department_id: string | null; journey_id: string },
  journeyDept: string | null | undefined,
): boolean {
  if (access.all) return true
  if (row.assigned_department_id && access.depts.includes(row.assigned_department_id)) return true
  return access.deptManager && !!journeyDept && access.depts.includes(journeyDept)
}

/** Фильтрует строки случаев по видимости (подгружает подразделения journeys). */
export async function filterVisibleAbsences<R extends { assigned_department_id: string | null; journey_id: string }>(
  sb: Sb,
  access: AbsenceAccess,
  rows: R[],
): Promise<R[]> {
  if (access.all) return rows
  const depts = access.deptManager ? await journeyDepartments(sb, rows.map(r => r.journey_id)) : new Map<string, string | null>()
  return rows.filter(r => canSeeAbsence(access, r, depts.get(r.journey_id)))
}
