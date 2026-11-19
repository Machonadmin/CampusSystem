// Чистый (client-safe, без серверных импортов) помощник: какие ссылки
// показывать внутри модуля «מרחב יהדות» (/dashboard/kodesh-space). Использует
// сервер (/api/education/workspace-nav); здесь НЕТ обращений к БД/сессии —
// только отображение прав в видимость ссылок.

export interface KodeshNavPerms {
  viewStudents: boolean       // canDoEducationInAny('view_students')
  manageClassGroups: boolean  // canManageEducationInAny('manage_class_groups')
  kodesh: boolean             // canManageUnit(KODESH_DEPT_ID)
  jewishness: boolean         // hasJewishnessAccess
  contacts: boolean           // hasContactsPrivilege('view')
}

/**
 * Видимость каждого пункта §10, по ТЕМ ЖЕ правам, что энфорсит его экран
 * (fail-closed: нет права → пункт скрыт). «Дом» виден всегда — это посадочный
 * экран пространства. Чистая функция.
 */
export function kodeshNavItemVisibility(p: KodeshNavPerms): Record<string, boolean> {
  return {
    home: true,
    prep: p.kodesh,
    alerts: p.viewStudents,
    calendar: p.manageClassGroups,
    courses: p.kodesh,
    teachers: p.viewStudents,
    students: p.viewStudents,
    jewishness: p.jewishness,
    contacts: p.contacts,
  }
}
