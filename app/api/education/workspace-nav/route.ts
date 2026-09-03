import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { isKodeshDepartmentWorkspace } from '@/lib/education/kodesh-workspace'
import { canDoEducationInAny, canManageEducationInAny } from '@/lib/education/permissions'
import { canManageUnit } from '@/lib/education/unit-access'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { hasJewishnessAccess } from '@/lib/jewishness/permissions'
import { hasContactsPrivilege } from '@/lib/contacts/permissions'

/**
 * GET /api/education/workspace-nav — сфокусированная навигация §10 для управляющей
 * кафедрой иудаики. Возвращает признак рабочего пространства + видимость каждого
 * пункта, вычисленную теми же правами, что энфорсят целевые маршруты (fail-closed:
 * нет права → пункт скрыт). Ни один экран НЕ новый — это только перекладка ссылок.
 *
 * Если пользователь НЕ в пространстве иудаики (или ошибка) → kodesh_workspace:false,
 * и клиент показывает обычный сайдбар (ничего не сужается — fail-safe).
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })

    const kodeshWorkspace = await isKodeshDepartmentWorkspace(session)
    if (!kodeshWorkspace) {
      return NextResponse.json({ kodesh_workspace: false, items: {} })
    }

    // Право каждого пункта = ровно то, что проверяет его экран/эндпойнт.
    const [viewStudents, manageClassGroups, kodesh, jewishness, contacts] = await Promise.all([
      canDoEducationInAny(session, 'view_students'),
      canManageEducationInAny(session, 'manage_class_groups'),
      canManageUnit(session, KODESH_DEPT_ID),
      hasJewishnessAccess(session),
      hasContactsPrivilege(session, 'view'),
    ])

    return NextResponse.json({
      kodesh_workspace: true,
      items: {
        home: true,             // /dashboard/education/kodesh-home
        prep: kodesh,           // /dashboard/education/kodesh (шибуц/подготовка)
        alerts: viewStudents,   // /dashboard/education/alerts (§4.4)
        calendar: manageClassGroups, // /dashboard/education/timetable + לוח שנה
        courses: kodesh,        // /dashboard/education/kodesh-courses
        teachers: viewStudents, // /dashboard/education/teachers
        students: viewStudents, // /dashboard/education/studies?sec=students
        jewishness,             // /dashboard/jewishness
        contacts,               // /dashboard/contacts
      },
    })
  } catch {
    // Fail-safe: не смогли решить — отдаём обычный сайдбар (kodesh_workspace:false).
    return NextResponse.json({ kodesh_workspace: false, items: {} })
  }
}
