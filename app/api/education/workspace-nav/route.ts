import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { canEnterKodeshSpace } from '@/lib/kodesh-space/access'
import { kodeshNavItemVisibility } from '@/lib/education/kodesh-nav'
import { canDoEducationInAny, canManageEducationInAny } from '@/lib/education/permissions'
import { canManageUnit } from '@/lib/education/unit-access'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { hasJewishnessAccess } from '@/lib/jewishness/permissions'
import { hasContactsPrivilege } from '@/lib/contacts/permissions'

/**
 * GET /api/education/workspace-nav — какие экраны показывать ссылками внутри
 * модуля «מרחב יהדות» (/dashboard/kodesh-space). Видимость каждой ссылки
 * вычисляется теми же правами, что энфорсят целевые маршруты (fail-closed: нет
 * права → ссылка скрыта). Ни один экран не новый — это только ссылки.
 *
 * Кто не может войти в модуль (canEnterKodeshSpace) или ошибка → can_enter:false
 * и пустой список.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })

    if (!(await canEnterKodeshSpace(session))) {
      return NextResponse.json({ can_enter: false, items: {} })
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
      can_enter: true,
      // Видимость пунктов — чистая функция (lib/education/kodesh-nav), покрыта
      // тестами. fail-closed: нет права → пункт скрыт; «дом» виден всегда.
      items: kodeshNavItemVisibility({ viewStudents, manageClassGroups, kodesh, jewishness, contacts }),
    })
  } catch {
    // Fail-closed: не смогли решить — ссылок нет.
    return NextResponse.json({ can_enter: false, items: {} })
  }
}
