// ─── Единый реестр модулей ───────────────────────────────────────────────────
//
// До этого файла список модулей жил В ЧЕТЫРЁХ местах, и все четыре разошлись:
//
//   • middleware.ts            PROTECTED_MODULES   — 18 кодов
//   • app/api/auth/me/route.ts ALL_MODULE_CODES    — 19 кодов
//   • lib/module-colors.ts     KNOWN_MODULES       — 24 кода
//   • types/database.ts        PrivilegeModule     — 19 кодов
//
// Ни один список не совпадал с другим: 'staff' и 'quality_control' выдаются
// миграцией 20260708140000 как настоящие модули прав, но отсутствовали в типе;
// 'calendar' не знал ни один из трёх; 'recruitment'/'admission'/'studies'
// появились при разделении матрицы учёбы (20260819120000) и тоже не попали в
// тип — из-за чего lib/education/permissions.ts вынужден кастовать их через
// `as unknown as PrivilegeModule[]`.
//
// ЭТОТ ФАЙЛ — ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ. Все четыре списка выводятся из
// него, поэтому разойтись они больше не могут.
//
// Почему TS-константа, а не таблица в БД: middleware.ts работает в Edge-runtime,
// где обращение к БД ради статического списка недопустимо (лишний round-trip на
// КАЖДЫЙ запрос). Каталог самих ПРИВИЛЕГИЙ живёт в БД (module_privileges) —
// там он и должен быть, потому что его правит администратор. Список модулей
// правит разработчик вместе с маршрутом, поэтому его место в коде.
//
// Инвариант проверяется тестом-стражем lib/modules/registry.test.ts: он сканирует
// app/dashboard/*/page.tsx и падает, если появился экран модуля, которого здесь нет.

import type { translations } from '@/lib/i18n/translations'

/** Ключ подписи модуля в translations.<lang>.nav (он уже на трёх языках). */
export type NavKey = keyof (typeof translations)['ru']['nav']

export interface ModuleDef {
  /** Код модуля: значение role_privileges.module / person_privileges.module. */
  code: string
  /** Подпись берётся из translations.<lang>.nav[navKey] — ru/he/en уже там. */
  navKey: NavKey
  /** Маршрут экрана; null — у модуля нет собственной страницы. */
  href: string | null

  /**
   * Страницу модуля закрывает middleware по праву '<code>.access'.
   * Ровно прежний PROTECTED_MODULES — менять состав здесь НЕЛЬЗЯ без отдельного
   * решения: добавление закроет модуль всем, у кого нет 'access'.
   */
  routeGuard: boolean

  /**
   * Страница САМА закрывает вход (redirect на главную или экран «нет доступа»).
   * Только такие модули попадают в MODULE_GATE_EXCEPTIONS — этого требует
   * страж lib/permissions/module-gates.test.ts: исключение без гейтящей
   * страницы он считает протухшим.
   */
  pageGates: boolean

  /**
   * Право, которое требует САМА страница сверх '<code>.access' (прежняя
   * MODULE_PAGE_PRIVILEGE). Правило «видит ⇔ может войти»: модуль показывается
   * в меню, только если есть и 'access', и это право.
   */
  pagePrivilege: string | null

  /** Почему странице не нужно право сверх 'access' (прежние MODULE_GATE_EXCEPTIONS). */
  gateExceptionReason?: string

  /** Входит в список модулей, которые видит superadmin (/api/auth/me). */
  inAccessibleModules: boolean

  /** Есть палитра в globals.css (прежний KNOWN_MODULES). */
  hasColour: boolean

  /** Экран реально существует (прежний IMPLEMENTED_MODULES). */
  implemented: boolean

  /** Показывается отдельным пунктом в сайдбаре. */
  inSidebar: boolean

  /** Допустимое значение колонки module в таблицах прав. */
  isPrivilegeModule: boolean
}

// Порядок = порядок в сайдбаре (для тех, у кого inSidebar).
export const MODULES = [
  // ── Верхние пункты меню: не модули прав, страницы не гейтятся ──────────────
  {
    code: 'dashboard', navKey: 'home', href: '/dashboard',
    routeGuard: false, pageGates: false, pagePrivilege: null,
    gateExceptionReason: 'Главная: доступна каждому сотруднику по факту входа.',
    inAccessibleModules: false, hasColour: true, implemented: false,
    inSidebar: false, isPrivilegeModule: false,
  },
  {
    code: 'calendar', navKey: 'calendar', href: '/dashboard/calendar',
    routeGuard: false, pageGates: false, pagePrivilege: null,
    gateExceptionReason:
      'Личный календарь: requireCalendarUser() в lib/calendar/permissions.ts ' +
      'пускает любого вошедшего, а записи фильтруются по provider_id = его person_id.',
    inAccessibleModules: false, hasColour: false, implemented: false,
    inSidebar: false, isPrivilegeModule: false,
  },
  {
    code: 'profile', navKey: 'profile', href: '/dashboard/profile',
    routeGuard: false, pageGates: false, pagePrivilege: null,
    gateExceptionReason:
      'Личный экран «הפרופיל שלי»: только свои данные и своя раскладка ' +
      '(/api/me/preferences берёт person_id из сессии). Прав не выдаёт и не показывает чужого.',
    inAccessibleModules: false, hasColour: false, implemented: false,
    inSidebar: false, isPrivilegeModule: false,
  },
  {
    code: 'tasks', navKey: 'tasks', href: '/dashboard/tasks',
    routeGuard: false, pageGates: false, pagePrivilege: null,
    gateExceptionReason:
      'Задачи: иерархия доступа своя (lib/tasks/access.ts), страница не гейтится ' +
      'модульным правом. В ALL_MODULE_CODES при этом ВХОДИТ — прежнее расхождение сохранено.',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: false, isPrivilegeModule: true,
  },

  // ── Люди и персонал ────────────────────────────────────────────────────────
  {
    code: 'persons', navKey: 'persons', href: '/dashboard/persons',
    routeGuard: true, pageGates: true, pagePrivilege: 'view',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'staff', navKey: 'staff', href: '/dashboard/staff',
    routeGuard: true, pageGates: false, pagePrivilege: null,
    gateExceptionReason:
      'Страница «Управление сотрудниками» гейтится тем же access, что и видимость.',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true,
    // Миграция 20260708140000 выдаёт ('staff','access') как обычный модуль прав,
    // но в PrivilegeModule его не было — это и есть прежнее расхождение.
    isPrivilegeModule: true,
  },
  {
    code: 'contacts', navKey: 'contacts', href: '/dashboard/contacts',
    routeGuard: true, pageGates: true, pagePrivilege: 'view',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },

  // ── Учёба ──────────────────────────────────────────────────────────────────
  {
    code: 'education', navKey: 'education', href: '/dashboard/education',
    routeGuard: true, pageGates: false, pagePrivilege: null,
    gateExceptionReason:
      'Зонтичный модуль учёбы: страница гейтится тем же access. Тонкие права живут ' +
      'в recruitment/admission/studies (см. EDU_PRIV_MODULES).',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'recruitment', navKey: 'recruitment', href: null,
    routeGuard: false, pageGates: false, pagePrivilege: null,
    gateExceptionReason: 'Не экран, а матрица прав: шаг конвейера внутри «Образования».',
    inAccessibleModules: false, hasColour: true, implemented: false,
    inSidebar: false, isPrivilegeModule: true,
  },
  {
    code: 'admission', navKey: 'admission', href: null,
    routeGuard: false, pageGates: false, pagePrivilege: null,
    gateExceptionReason: 'Не экран, а матрица прав: шаг конвейера внутри «Образования».',
    inAccessibleModules: false, hasColour: true, implemented: false,
    inSidebar: false, isPrivilegeModule: true,
  },
  {
    code: 'studies', navKey: 'studies', href: null,
    routeGuard: false, pageGates: false, pagePrivilege: null,
    gateExceptionReason: 'Не экран, а матрица прав: шаг конвейера внутри «Образования».',
    // Своего токена --mod-studies НЕТ: lib/module-colors.ts держит synonym
    // studies → education, чтобы карточка «Учёба» и раздел за ней не разъехались
    // по цвету. Поставить здесь true — значит увести tokenBase() на
    // несуществующую переменную и покрасить карточку в серый fallback.
    inAccessibleModules: false, hasColour: false, implemented: false,
    inSidebar: false, isPrivilegeModule: true,
  },
  {
    code: 'applicants', navKey: 'applicants', href: null,
    routeGuard: false, pageGates: false, pagePrivilege: null,
    gateExceptionReason:
      'Устаревший код каталога: маршрута /dashboard/applicants нет, код модуля — education.',
    inAccessibleModules: false, hasColour: false, implemented: false,
    inSidebar: false, isPrivilegeModule: true,
  },
  {
    code: 'chavruta', navKey: 'chavruta', href: '/dashboard/chavruta',
    routeGuard: false, pageGates: false, pagePrivilege: null,
    gateExceptionReason:
      'Доступ динамический (кодеш ∪ ручные назначения), считается в lib/chavruta/access.ts; ' +
      'сайдбар показывает пункт по флагу is_chavruta_teacher из /api/auth/me.',
    inAccessibleModules: false, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'jewishness', navKey: 'jewishness', href: '/dashboard/jewishness',
    routeGuard: true, pageGates: true, pagePrivilege: null,
    gateExceptionReason:
      'Страница гейтится hasJewishnessAccess — тем же access, что и видимость.',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'quality_control', navKey: 'quality_control', href: '/dashboard/quality-control',
    routeGuard: true, pageGates: false, pagePrivilege: null,
    gateExceptionReason:
      'Права уровня фич живут в feature_privileges (planned/history/templates), ' +
      'страница гейтится access.',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true,
    // Как и staff: выдаётся миграцией 20260708140000, но в типе не значился.
    isPrivilegeModule: true,
  },
  {
    code: 'alumni', navKey: 'alumni', href: '/dashboard/alumni',
    routeGuard: true, pageGates: false, pagePrivilege: null,
    gateExceptionReason: 'Страница гейтится тем же access, что и видимость.',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },

  // ── Быт и здоровье ─────────────────────────────────────────────────────────
  {
    code: 'dormitory', navKey: 'dormitory', href: '/dashboard/dormitory',
    routeGuard: true, pageGates: true, pagePrivilege: 'view',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'food', navKey: 'food', href: '/dashboard/food',
    routeGuard: true, pageGates: true, pagePrivilege: 'view',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'doctor', navKey: 'doctor', href: '/dashboard/doctor',
    routeGuard: true, pageGates: true, pagePrivilege: 'view',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'psychologist', navKey: 'psychologist', href: '/dashboard/psychologist',
    routeGuard: true, pageGates: true, pagePrivilege: 'view',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'health', navKey: 'health', href: '/dashboard/health',
    routeGuard: false, pageGates: true, pagePrivilege: null,
    gateExceptionReason:
      'Сводный экран доктор+психолог, не отдельный модуль меню: гейт — view любого из двух.',
    inAccessibleModules: false, hasColour: true, implemented: true,
    inSidebar: false, isPrivilegeModule: false,
  },

  // ── Администрирование и финансы ────────────────────────────────────────────
  {
    code: 'finance', navKey: 'finance', href: '/dashboard/finance',
    routeGuard: true, pageGates: false, pagePrivilege: null,
    gateExceptionReason:
      'Страница гейтится access; доступ к финансам КОНКРЕТНОЙ студентки — отдельная ' +
      'модель (finance_access_grants).',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'sponsors', navKey: 'sponsors', href: '/dashboard/sponsors',
    routeGuard: true, pageGates: true, pagePrivilege: 'view',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'documents', navKey: 'documents', href: '/dashboard/documents',
    routeGuard: true, pageGates: true, pagePrivilege: 'view',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'reports', navKey: 'reports', href: '/dashboard/reports',
    routeGuard: true, pageGates: true, pagePrivilege: 'view',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },

  // ── Эксплуатация ───────────────────────────────────────────────────────────
  {
    code: 'maintenance', navKey: 'maintenance', href: '/dashboard/maintenance',
    routeGuard: true, pageGates: true, pagePrivilege: 'view',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'security', navKey: 'security', href: '/dashboard/security',
    routeGuard: true, pageGates: true, pagePrivilege: 'view',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },

  // ── Система ────────────────────────────────────────────────────────────────
  {
    code: 'settings', navKey: 'settings', href: '/dashboard/settings',
    routeGuard: true, pageGates: false, pagePrivilege: null,
    gateExceptionReason: 'Страница-хаб гейтится тем же access, что и видимость.',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
  {
    code: 'data_security', navKey: 'data_security', href: '/dashboard/data-security',
    routeGuard: true, pageGates: true, pagePrivilege: null,
    gateExceptionReason:
      'Страница сама проверяет superadmin ∪ data_security.access — то же право, ' +
      'что и видимость.',
    inAccessibleModules: true, hasColour: true, implemented: true,
    inSidebar: true, isPrivilegeModule: true,
  },
] as const satisfies readonly ModuleDef[]

// ─── Производные списки ──────────────────────────────────────────────────────
// Каждый воспроизводит прежнюю константу один-в-один. Менять состав — только
// правкой флага выше, чтобы четыре списка не могли снова разойтись.

// Производные списки считаются по «широкому» виду: as const сузил каждое поле до
// литерала, а фильтрам нужен общий тип записи.
const ALL: readonly ModuleDef[] = MODULES

const byCode = new Map<string, ModuleDef>(ALL.map(m => [m.code, m]))

export function getModule(code: string): ModuleDef | undefined {
  return byCode.get(code)
}

/** Прежний middleware.ts → PROTECTED_MODULES. */
export const PROTECTED_MODULE_CODES: readonly string[] =
  ALL.filter(m => m.routeGuard).map(m => m.code)

/** Прежний app/api/auth/me/route.ts → ALL_MODULE_CODES. */
export const ALL_MODULE_CODES: readonly string[] =
  ALL.filter(m => m.inAccessibleModules).map(m => m.code)

/** Прежний lib/permissions/module-gates.ts → MODULE_PAGE_PRIVILEGE. */
export const MODULE_PAGE_PRIVILEGE: Readonly<Record<string, string>> =
  Object.fromEntries(
    ALL.filter(m => m.pagePrivilege).map(m => [m.code, m.pagePrivilege as string]),
  )

/** Прежний lib/permissions/module-gates.ts → MODULE_GATE_EXCEPTIONS. */
export const MODULE_GATE_EXCEPTIONS: Readonly<Record<string, string>> =
  Object.fromEntries(
    ALL
      .filter(m => m.pageGates && !m.pagePrivilege && m.gateExceptionReason)
      .map(m => [m.code, m.gateExceptionReason as string]),
  )

/** Прежний lib/module-colors.ts → KNOWN_MODULES. */
export const COLOURED_MODULE_CODES: readonly string[] =
  ALL.filter(m => m.hasColour).map(m => m.code)

/** Прежний lib/module-colors.ts → IMPLEMENTED_MODULES. */
export const IMPLEMENTED_MODULE_CODES: readonly string[] =
  ALL.filter(m => m.implemented).map(m => m.code)

/** Допустимые значения колонки module в таблицах прав (types/database.ts). */
export const PRIVILEGE_MODULE_CODES: readonly string[] =
  ALL.filter(m => m.isPrivilegeModule).map(m => m.code)

/** Модули с собственным пунктом сайдбара, в порядке отображения. */
export const SIDEBAR_MODULES: readonly ModuleDef[] = ALL.filter(m => m.inSidebar)

/**
 * Код модуля из пути /dashboard/<segment>. Директории пишутся через дефис
 * ('quality-control'), а код модуля — через подчёркивание ('quality_control').
 * Без нормализации страница не сматчилась бы с реестром.
 */
export function moduleCodeFromSegment(segment: string): string {
  return segment.replace(/-/g, '_')
}

// ─── Тип кода модуля прав ────────────────────────────────────────────────────
//
// Выводится из самого реестра, а не пишется руками во втором месте: именно
// расхождение между руками написанным union'ом в types/database.ts и реальными
// строками в role_privileges заставляло lib/education/permissions.ts кастовать
// коды через `as unknown as PrivilegeModule[]`.

type ModuleEntry = (typeof MODULES)[number]

/** Значение колонки module в role_privileges / person_privileges / module_privileges. */
export type PrivilegeModuleCode =
  Extract<ModuleEntry, { isPrivilegeModule: true }>['code']

/** Код любого модуля реестра (включая те, что не являются модулями прав). */
export type ModuleCode = ModuleEntry['code']
