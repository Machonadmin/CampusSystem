import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

/**
 * Страж авторизации маршрутов. Каждый route.ts в app/api должен явно проверять
 * право доступа — сессию и/или привилегию/роль. Аутентификацию (валидный токен)
 * навязывает middleware.ts для ВСЕХ /api/** кроме PUBLIC_API_PREFIXES; но КАКУЮ
 * привилегию требовать — решает сам обработчик. Легко при добавлении/правке
 * нового маршрута забыть эту проверку — и тогда любой залогиненный сотрудник
 * получит доступ к чужому модулю. Этот тест фиксирует текущее (корректное)
 * состояние и роняет сборку, если будущее изменение молча уронит проверку.
 *
 * Две ступени:
 *   Tier 1 — любой непубличный маршрут обязан ссылаться хотя бы на один
 *            распознаваемый примитив авторизации (не «висит» совсем без проверки).
 *   Tier 2 — маршрут чувствительного модуля обязан ссылаться на проверку
 *            привилегии/роли/скоупа СВЕРХ голой сессии (getSession/requireAuth
 *            в одиночку — недостаточно: иначе любой залогиненный увидит финансы/
 *            медкарты и т.п.).
 *
 * Тест НЕ запускает маршруты — это статическая проверка исходников (как
 * lib/migrations/hygiene.test.ts). Он не может доказать, что проверка верна по
 * смыслу, но гарантирует, что она ПРИСУТСТВУЕТ.
 */

const API_DIR = join(process.cwd(), 'app', 'api')

function walkRoutes(dir: string): string[] {
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const s = statSync(p)
    if (s.isDirectory()) out = out.concat(walkRoutes(p))
    else if (entry === 'route.ts') out.push(p)
  }
  return out
}

/** Путь маршрута относительно app/api, всегда через '/'. */
const relRoute = (f: string) => f.slice(API_DIR.length + 1).split(sep).join('/')

// Публичные префиксы — источник истины тот же, что в middleware.ts
// (PUBLIC_API_PREFIXES). Эти маршруты намеренно доступны без сессии.
const PUBLIC_PREFIXES = ['auth/', 'dev-login', 'public/', 'portal/login', 'cron/']
const isPublic = (r: string) => PUBLIC_PREFIXES.some(p => r.startsWith(p))

// Чувствительные модули: их обработчики обязаны проверять привилегию/роль, а не
// только факт логина. Совпадает с PROTECTED_MODULES из middleware (+ education,
// applicants — образовательные данные), имена — как директории в app/api.
const SENSITIVE_MODULES = new Set([
  'doctor', 'psychologist', 'finance', 'jewishness', 'sponsors', 'documents',
  'persons', 'dormitory', 'food', 'security', 'maintenance', 'reports',
  'contacts', 'staff', 'quality-control', 'settings', 'alumni', 'education',
  'applicants',
])

// Любой распознаваемый примитив авторизации (Tier 1).
const ANY_GUARD = [
  /getSession/, /requireAuth/, /requireStaff/, /requireSuperadmin/,
  /require\w*Privilege/, /require\w*Access/, /requireCalendarUser/,
  /requirePrivilege/, /requirePortal\w*/, /has\w*Privilege/,
  /get\w*PrivilegeScope/, /getUserDepartmentIds/, /can[A-Z]\w+/, /canDo\w+/,
  /roles\.includes/, /principal/,
]

// Проверка СВЕРХ голой сессии (Tier 2) — всё из ANY_GUARD, кроме одиночных
// getSession/requireAuth/requireStaff/principal.
const STRONG_GUARD = [
  /requireSuperadmin/, /require\w*Privilege/, /require\w*Access/,
  /requireCalendarUser/, /requirePrivilege\b/, /requirePortal\w*/,
  /has\w*Privilege/, /get\w*PrivilegeScope/, /can[A-Z]\w+/, /canDo\w+/,
  /roles\.includes/,
]

/**
 * Задокументированные исключения: непубличные маршруты, которые НАМЕРЕННО не
 * содержат собственной проверки привилегии в этом файле. Ключ — путь (от
 * app/api), значение — причина. Держать список коротким; каждая запись
 * обязана указывать на живой файл (иначе тест ниже упадёт как «протухшее
 * исключение»).
 */
const EXCEPTIONS: Record<string, string> = {
  // Тонкие прокси: делегируют обработчикам /education/journeys(/[id]), которые и
  // выполняют авторизацию. Помечены DEPRECATED, удалятся в Part 2 миграции.
  'education/students/route.ts': 'proxy → /education/journeys handler (authz внутри него)',
  'education/students/[id]/route.ts': 'proxy → /education/journeys/[id] handler (authz внутри него)',
  // Выход из портала — только очистка cookie, без обращения к данным.
  'portal/logout/route.ts': 'logout: очистка cookie, данные не читаются',
  // Справочные списки, читаемые любым залогиненным сотрудником (низкая
  // чувствительность); авторизация = факт сессии.
  'education/directions/route.ts': 'справочник направлений, доступен любому сотруднику',
  'education/institutions/route.ts': 'справочник учреждений, доступен любому сотруднику',
  'education/levels/route.ts': 'справочник уровней, доступен любому сотруднику',
  // Собственные данные преподавателя: выборка ограничена teacher_id =
  // session.person_id (скоуп «own» задан фильтром, а не хелпером привилегий).
  'education/my-groups/route.ts': 'own-data: teacher_id = session.person_id',
  'education/my-lessons/route.ts': 'own-data: teacher_id = session.person_id',
}

const routeFiles = walkRoutes(API_DIR)
const sources = new Map(routeFiles.map(f => [relRoute(f), readFileSync(f, 'utf8')]))

describe('API route authorization coverage', () => {
  it('there are route files to check', () => {
    expect(routeFiles.length).toBeGreaterThan(100)
  })

  it('every non-public route references an authorization primitive (Tier 1)', () => {
    const missing: string[] = []
    for (const [r, src] of sources) {
      if (isPublic(r) || EXCEPTIONS[r]) continue
      if (!ANY_GUARD.some(re => re.test(src))) missing.push(r)
    }
    expect(
      missing,
      `routes with NO authorization check (add a guard, or an EXCEPTIONS entry with reason):\n${missing.join('\n')}`,
    ).toEqual([])
  })

  it('every sensitive-module route checks a privilege/role beyond bare session (Tier 2)', () => {
    const weak: string[] = []
    for (const [r, src] of sources) {
      if (isPublic(r) || EXCEPTIONS[r]) continue
      const mod = r.split('/')[0]
      if (!SENSITIVE_MODULES.has(mod)) continue
      if (!STRONG_GUARD.some(re => re.test(src))) weak.push(r)
    }
    expect(
      weak,
      `sensitive routes guarded by bare session only (need a privilege/role/scope check):\n${weak.join('\n')}`,
    ).toEqual([])
  })

  it('every cron route enforces the CRON_SECRET bearer check', () => {
    const bad: string[] = []
    for (const [r, src] of sources) {
      if (!r.startsWith('cron/')) continue
      if (!/CRON_SECRET/.test(src)) bad.push(r)
    }
    expect(bad, `cron routes not checking CRON_SECRET:\n${bad.join('\n')}`).toEqual([])
  })

  it('no stale EXCEPTIONS: every documented exception still points to a real route', () => {
    const stale = Object.keys(EXCEPTIONS).filter(r => !sources.has(r))
    expect(stale, `EXCEPTIONS entries for files that no longer exist:\n${stale.join('\n')}`).toEqual([])
  })
})
