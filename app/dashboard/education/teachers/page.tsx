import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny, getUserDepartmentIds } from '@/lib/education/permissions'
import { getPrivilegeScope } from '@/lib/auth/module-privileges'
import { createServerClient } from '@/lib/supabase/server'
import TeachersClient, { type NewTeacherDept } from './TeachersClient'

/**
 * «מורים» — объединённая страница (owner: «רעיון נהדר» на слияние):
 * вкладка «Часы» (бывш. מורים ושעות) + вкладка «Посещаемость» (бывш. נוכחות
 * מורים). Старые адреса редиректят сюда.
 * Доступ: любой сотрудник (учитель отмечает своё присутствие); вкладка часов —
 * только view_students/superadmin, подтверждение — manage_students/superadmin.
 *
 * Кнопка «מורה חדשה» (owner: добавить учительницу прямо отсюда) — тому, у
 * кого есть persons.create. Список подразделений — те, где это право
 * действует: при scope 'department' — свои подразделения (как и проверяет
 * POST /api/persons), при 'all' — подразделения, где есть учебные группы.
 */
export default async function TeachersPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.principal === 'student') redirect('/dashboard')

  const isSuper = session.roles.includes('superadmin')
  const canHours = isSuper || await canDoEducationInAny(session, 'view_students')
  const canApprove = isSuper || await canDoEducationInAny(session, 'manage_students')

  const newTeacherDepts = await loadNewTeacherDepts(session)

  return <TeachersClient canHours={canHours} canApprove={canApprove} newTeacherDepts={newTeacherDepts} />
}

async function loadNewTeacherDepts(
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
): Promise<NewTeacherDept[]> {
  try {
    const scope = await getPrivilegeScope(session, 'persons', 'create')
    if (scope !== 'all' && scope !== 'department') return []

    const sb = createServerClient()
    let deptIds: string[]
    if (scope === 'all') {
      const { data: groups } = await sb.from('class_groups').select('department_id')
      deptIds = [...new Set((groups ?? [])
        .map(g => (g as { department_id: string | null }).department_id)
        .filter(Boolean) as string[])]
    } else {
      deptIds = await getUserDepartmentIds(session.person_id)
    }
    if (deptIds.length === 0) return []

    const { data: depts } = await sb.from('departments')
      .select('id, name, name_he, name_en').in('id', deptIds)
    const list = (depts ?? []) as NewTeacherDept[]
    list.sort((a, b) => (a.name_he || a.name).localeCompare(b.name_he || b.name, 'he'))
    return list
  } catch {
    // Кнопка — удобство; при сбое просто не показываем её, страница работает.
    return []
  }
}
