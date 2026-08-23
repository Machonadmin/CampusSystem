import { NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny, getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'

/**
 * GET /api/education/teaching-surveys/departments
 * Подразделения, для которых текущий менеджер может создать сбор «הערכת הוראה»:
 *   • superadmin / scope='all' — все подразделения, у которых есть учебные группы
 *     (значит, есть преподаватели, которых можно оценивать);
 *   • scope='department' — только свои подразделения.
 * Служит списком для селектора в форме создания сбора. Deploy-safe.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)
    const isManager = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_students')
    if (!isManager) return apiError('forbidden', 403)

    const sb = createServerClient()
    const scopeAll = session.roles.includes('superadmin')
      || (await getEducationPrivilegeScope(session, 'manage_students')) === 'all'

    let deptIds: string[]
    if (scopeAll) {
      // Подразделения, у которых есть учебные группы (там есть преподаватели).
      const { data: groups } = await sb.from('class_groups').select('department_id')
      deptIds = [...new Set((groups ?? [])
        .map(g => (g as { department_id: string | null }).department_id)
        .filter(Boolean) as string[])]
    } else {
      deptIds = await getUserDepartmentIds(session.person_id)
    }

    if (deptIds.length === 0) return NextResponse.json({ departments: [] })
    const { data: depts } = await sb.from('departments')
      .select('id, name, name_he, name_en').in('id', deptIds)
    const list = (depts ?? []) as Array<{ id: string; name: string; name_he: string | null; name_en: string | null }>
    list.sort((a, b) => (a.name_he || a.name).localeCompare(b.name_he || b.name, 'he'))
    return NextResponse.json({ departments: list })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
