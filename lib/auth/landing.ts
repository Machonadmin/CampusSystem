// ─── Умная посадка по роли (Workstream 3a) ───────────────────────────────────
//
// После входа каждый сотрудник попадает на СВОЙ рабочий экран, а не всегда на
// общую сетку модулей. Если пользователь пришёл по ссылке на конкретную
// страницу (?from=...), уважаем её — посадка по роли только для «пустого» входа.

// Роль → её основной ежедневный экран. Роли без записи → общая сетка /dashboard.
const ROLE_LANDING: Record<string, string> = {
  teacher:            '/dashboard/education/my-day',
  recruiter:          '/dashboard/education',
  studies_manager:    '/dashboard/education',
  studies_secretary:  '/dashboard/education',
  head_of_studies:    '/dashboard/education',
  jewishness_officer: '/dashboard/jewishness',
  campus_doctor:      '/dashboard/doctor',
  hr_director:        '/dashboard/staff',
  kitchen:            '/dashboard/food',
  security:           '/dashboard/security',
}

/**
 * Куда отправить пользователя после входа, исходя из ролей.
 * - superadmin / campus_admin → полная сетка модулей (они курируют всё);
 * - иначе первая роль с известным экраном → он;
 * - если совпадений нет → /dashboard.
 */
export function landingRouteForRoles(roles: string[] | null | undefined): string {
  const list = roles ?? []
  if (list.includes('superadmin') || list.includes('campus_admin')) return '/dashboard'
  for (const r of list) {
    if (ROLE_LANDING[r]) return ROLE_LANDING[r]
  }
  return '/dashboard'
}
