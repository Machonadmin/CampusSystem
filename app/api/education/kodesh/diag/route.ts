import { NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { createServerClient } from '@/lib/supabase/server'
import { canManageUnit } from '@/lib/education/unit-access'
import { getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'

/**
 * GET /api/education/kodesh/diag — диагностика доступа ТЕКУЩЕГО пользователя к
 * кодешу (для отладки: почему у אחראית יהדות не виден раздел кодеша). Возвращает
 * ТОЛЬКО собственные вычисленные флаги (никаких чужих данных). Работает и под
 * «צפה כמשתמש» (GET), так что показывает вычисления для просматриваемого лица.
 */
export async function GET() {
  const session = await getSession()
  if (!session) return apiError('unauthorized', 401)

  const sb = createServerClient()

  const [manageEnroll, manageGroups, viewStudents, deptIds, canUnit] = await Promise.all([
    getEducationPrivilegeScope(session, 'manage_enrollments'),
    getEducationPrivilegeScope(session, 'manage_class_groups'),
    getEducationPrivilegeScope(session, 'view_students'),
    getUserDepartmentIds(session.person_id),
    canManageUnit(session, KODESH_DEPT_ID),
  ])

  // Активные должности человека (сырые), чтобы видеть department_id/is_head/end_date.
  const { data: seats } = await sb
    .from('staff_positions')
    .select('department_id, is_head, end_date, position_he, position_ru')
    .eq('person_id', session.person_id)

  // Уровни кодеша (для проверки, что данные вообще есть).
  let kodeshLevels = 0
  try {
    const { count } = await sb
      .from('class_groups')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', KODESH_DEPT_ID)
      .eq('is_active', true)
      .is('parent_semester_id', null)
    kodeshLevels = count ?? 0
  } catch { /* noop */ }

  const kodeshInDepts = deptIds.includes(KODESH_DEPT_ID)
  const canManageKodesh = canUnit
    || (manageEnroll === 'all' || (manageEnroll === 'department' && kodeshInDepts))
    || (manageGroups === 'all' || (manageGroups === 'department' && kodeshInDepts))

  return NextResponse.json({
    person_id: session.person_id,
    full_name: session.full_name,
    impersonated: !!session.imp_by,
    roles: session.roles,
    scopes: { manage_enrollments: manageEnroll, manage_class_groups: manageGroups, view_students: viewStudents },
    my_department_ids: deptIds,
    kodesh_dept_id: KODESH_DEPT_ID,
    kodesh_in_my_departments: kodeshInDepts,
    can_manage_unit_kodesh: canUnit,
    can_manage_kodesh_result: canManageKodesh,
    kodesh_levels_count: kodeshLevels,
    seats: (seats ?? []).map(s => ({
      department_id: (s as { department_id: string | null }).department_id,
      is_kodesh: (s as { department_id: string | null }).department_id === KODESH_DEPT_ID,
      is_head: (s as { is_head: boolean }).is_head,
      end_date: (s as { end_date: string | null }).end_date,
      title: (s as { position_he: string | null; position_ru: string | null }).position_he
        || (s as { position_ru: string | null }).position_ru,
    })),
  })
}
