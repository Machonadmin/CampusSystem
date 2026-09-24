// Чистые (client-safe, без серверных импортов) помощники сфокусированной
// навигации §10 для рабочего пространства «кафедра иудаики». Используются и
// сервером (/api/education/workspace-nav), и клиентом (Sidebar), поэтому здесь
// НЕТ обращений к БД/сессии — только отображение прав в видимость пунктов и
// вычисление блока «ещё» (гарантия «ничего не пропало из доступного»).

/** Модули верхнего меню, которые §10 уже покрывает своими пунктами. */
export const KODESH_COVERED_MODULES: ReadonlySet<string> = new Set([
  'education',
  'jewishness',
  'contacts',
])

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

/**
 * Пункты верхнего меню, которые §10 НЕ покрывает, но к которым у пользователя
 * есть доступ, — их держим в блоке «ещё», чтобы перекладка навигации ничего не
 * убрала из доступного. Чистая функция.
 */
export function kodeshMoreModuleItems<T extends { key: string }>(
  items: readonly T[],
  covered: ReadonlySet<string> = KODESH_COVERED_MODULES,
): T[] {
  return items.filter(m => !covered.has(m.key))
}

/**
 * Разделы «Образования» вне §10 (набор/приём), к которым есть доступ. «Учёба»
 * (study) исключена — её покрывает пункт «תלמידות». Чистая функция.
 */
export function kodeshMoreEduSections<T extends { key: string }>(
  sections: readonly T[],
  tabAccess: Record<string, boolean> | null | undefined,
): T[] {
  return sections.filter(s => s.key !== 'study' && tabAccess?.[s.key] === true)
}
