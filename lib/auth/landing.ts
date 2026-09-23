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
// (superadmin) всегда остаётся на общем /dashboard.
//
// Прямые ссылки (?from=...) по-прежнему уважаются в LoginForm — это только выбор
// стартового экрана для «пустого» входа.

// Роли «широкого» админа кампуса — они всегда открываются на общий главный
// экран, даже если формально числятся где-то главой единицы. Client-safe
// (без серверных импортов): используется и на клиенте (LoginForm), и на сервере.
//
// Здесь ТОЛЬКО реально существующие роли. 'campus_admin' убран (аудит §25 Q4):
// его сеет лишь миграция 001, которую 002 затирает через
// `TRUNCATE ... roles CASCADE`, он отсутствует в объединении RoleCode и НИ ОДНА
// привилегия к нему не привязана — то есть роль без прав молча считалась бы
// «широким админом». Код роли в справочнике — свободный текст, поэтому
// superadmin может создать 'campus_admin' вручную; после этой правки такая роль
// НЕ получает особого поведения посадки (superadmin и так всемогущ).
const BROADER_ADMIN_ROLES = ['superadmin'] as const

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

/**
 * Проверка ?from перед переходом после входа. Параметр приходит из адресной
 * строки, то есть его может подставить кто угодно: ссылка вида
 * /login?from=https://чужой-сайт после ввода настоящего пароля увела бы
 * пользователя на поддельную страницу («сессия истекла, введите пароль ещё
 * раз»). Поэтому пропускаем только внутренний путь этого же сайта: начинается
 * с одного '/', без '//' и '/\' (браузер читает их как адрес другого хоста) и
 * без управляющих символов. Всё остальное → null, и LoginForm берёт посадку по
 * роли.
 */
export function safeInternalPath(from: string | null | undefined): string | null {
  if (!from) return null
  if (!from.startsWith('/')) return null
  if (from.startsWith('//') || from.startsWith('/\\')) return null
  if (/[\u0000-\u001f\u007f\\]/.test(from)) return null
  return from
}
