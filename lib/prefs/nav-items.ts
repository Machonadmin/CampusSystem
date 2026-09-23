/**
 * Какие пункты меню доступны человеку — в том же порядке и с теми же id, что
 * в боковом меню (components/dashboard/Sidebar.tsx) и на плитках главной.
 * Нужен экрану «הפרופיל שלי», где сотрудник отмечает избранное и скрытое: там
 * должны быть ровно те пункты, которые он видит в меню, и ни одного лишнего.
 *
 * Доступ считается по тем же данным и тем же правилам, что и в меню:
 *   • обычный модуль — по accessible_modules из /api/auth/me;
 *   • «Здоровье» — если доступен рофэ ИЛИ психолог (один пункт на двоих);
 *   • три раздела образования — по /api/education/tab-access (fail-closed: === true);
 *   • хеврута — динамический доступ (преподаватель / хаб / модуль);
 *   • «שכר צוות» — по can_view_staff_comp.
 */

export interface NavAccessInput {
  accessible_modules: string[]
  is_chavruta_teacher?: boolean
  can_view_chavruta?: boolean
  can_view_staff_comp?: boolean
}

// Порядок = группы бокового меню сверху вниз (MODULE_GROUPS в Sidebar.tsx).
// 'education' разворачивается в разделы, 'finance' — в модуль + שכר צוות.
export const NAV_GROUP_ORDER: ReadonlyArray<{ group: string; ids: readonly string[] }> = [
  { group: 'studies', ids: ['recruitment', 'admission', 'studies', 'chavruta', 'jewishness', 'quality_control', 'alumni'] },
  { group: 'wellbeing', ids: ['dormitory', 'food', 'health'] },
  { group: 'admin_finance', ids: ['finance', 'finance_staff', 'sponsors', 'documents', 'reports'] },
  { group: 'operations', ids: ['maintenance', 'security'] },
  { group: 'people_staff', ids: ['persons', 'staff', 'contacts'] },
  { group: 'system', ids: ['data_security', 'settings'] },
]

// id раздела образования → ключ в ответе /api/education/tab-access.
const EDU_TAB_KEY: Record<string, string> = { recruitment: 'recruitment', admission: 'committee', studies: 'study' }

export function isNavItemAccessible(id: string, me: NavAccessInput, eduAccess: Record<string, boolean> | null): boolean {
  const mods = me.accessible_modules
  if (id in EDU_TAB_KEY) return mods.includes('education') && eduAccess?.[EDU_TAB_KEY[id]] === true
  if (id === 'health') return mods.includes('doctor') || mods.includes('psychologist')
  if (id === 'chavruta') return !!me.is_chavruta_teacher || !!me.can_view_chavruta || mods.includes('chavruta')
  if (id === 'finance_staff') return mods.includes('finance') && !!me.can_view_staff_comp
  return mods.includes(id)
}

/** Доступные пункты, сгруппированные как в меню (пустые группы опущены). */
export function accessibleNavGroups(me: NavAccessInput, eduAccess: Record<string, boolean> | null): Array<{ group: string; ids: string[] }> {
  return NAV_GROUP_ORDER
    .map(g => ({ group: g.group, ids: g.ids.filter(id => isNavItemAccessible(id, me, eduAccess)) }))
    .filter(g => g.ids.length > 0)
}
