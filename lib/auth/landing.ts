// ─── Посадка после входа ──────────────────────────────────────────────────────
//
// По умолчанию каждый пользователь после входа попадает на общий главный экран
// /dashboard (сетка модулей + повестка + виджеты, отфильтрованные под его доступ).
//
// ИСКЛЮЧЕНИЕ (§10): управляющая кафедрой иудаики (kodesh) — её рабочее
// пространство это отдельный дом иудаики, поэтому она открывается сразу на
// /dashboard/education/kodesh-home. Признак «рабочее пространство = кафедра
// иудаики» вычисляется на сервере (isKodeshDepartmentWorkspace) и передаётся сюда
// как ctx.kodeshWorkspace — НЕ угадывается по строке роли. Более широкий админ
// (superadmin/campus_admin) всегда остаётся на общем /dashboard.
//
// Прямые ссылки (?from=...) по-прежнему уважаются в LoginForm — это только выбор
// стартового экрана для «пустого» входа.

// Роли «широкого» админа кампуса — они всегда открываются на общий главный
// экран, даже если формально числятся где-то главой единицы. Client-safe
// (без серверных импортов): используется и на клиенте (LoginForm), и на сервере.
const BROADER_ADMIN_ROLES = ['superadmin', 'campus_admin'] as const

export function hasBroaderAdminRole(roles: string[] | null | undefined): boolean {
  const r = roles ?? []
  return BROADER_ADMIN_ROLES.some(code => r.includes(code))
}

export interface LandingContext {
  /** True, когда рабочее пространство пользователя — кафедра иудаики (kodesh). */
  kodeshWorkspace?: boolean
}

/**
 * Куда отправить пользователя после входа. По умолчанию — общий главный экран;
 * управляющая кафедрой иудаики (и не более широкий админ) — на дом иудаики.
 */
export function landingRouteForRoles(
  roles: string[] | null | undefined,
  ctx?: LandingContext,
): string {
  if (ctx?.kodeshWorkspace && !hasBroaderAdminRole(roles)) {
    return '/dashboard/education/kodesh-home'
  }
  return '/dashboard'
}
