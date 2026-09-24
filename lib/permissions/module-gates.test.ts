import { describe, it, expect } from 'vitest'
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MODULE_PAGE_PRIVILEGE,
  MODULE_GATE_EXCEPTIONS,
  effectivePrivileges,
  visibleModules,
} from './module-gates'

// Правило владельца: «есть доступ — видит и заходит; нет доступа — не заходит и
// НЕ ВИДИТ». Раньше видимость считалась по '<module>.access', а вход — по
// '<module>.view', и они расходились: плитка «Эксплуатация» была на месте, а
// клик молча возвращал на главную. Ниже — и проверка самой логики, и страж,
// который не даст двум сторонам снова разъехаться.

describe('effectivePrivileges', () => {
  const role = (module: string, privilege_code: string) => ({ module, privilege_code })

  it('складывает права всех ролей по модулям', () => {
    const eff = effectivePrivileges(
      [role('food', 'access'), role('food', 'view'), role('security', 'access')], [], 0,
    )
    expect([...eff.get('food')!].sort()).toEqual(['access', 'view'])
    expect([...eff.get('security')!]).toEqual(['access'])
  })

  it('персональный grant добавляет право, которого нет у роли', () => {
    const eff = effectivePrivileges(
      [role('food', 'access')],
      [{ module: 'food', privilege_code: 'view', is_granted: true, expires_at: null }], 0,
    )
    expect(eff.get('food')!.has('view')).toBe(true)
  })

  it('персональный deny отнимает право, выданное ролью', () => {
    const eff = effectivePrivileges(
      [role('food', 'access'), role('food', 'view')],
      [{ module: 'food', privilege_code: 'view', is_granted: false, expires_at: null }], 0,
    )
    expect(eff.get('food')!.has('view')).toBe(false)
    expect(eff.get('food')!.has('access')).toBe(true)
  })

  it('просроченный оверрайд игнорируется — и grant, и deny', () => {
    const now = 1_000
    const expired = new Date(now - 1).toISOString()
    const granted = effectivePrivileges([], [{ module: 'food', privilege_code: 'access', is_granted: true, expires_at: expired }], now)
    expect(granted.get('food')).toBeUndefined()
    const denied = effectivePrivileges(
      [role('food', 'access')],
      [{ module: 'food', privilege_code: 'access', is_granted: false, expires_at: expired }], now,
    )
    expect(denied.get('food')!.has('access')).toBe(true)
  })

  it('grant человеку БЕЗ ролей всё равно работает', () => {
    const eff = effectivePrivileges([], [
      { module: 'food', privilege_code: 'access', is_granted: true, expires_at: null },
      { module: 'food', privilege_code: 'view', is_granted: true, expires_at: null },
    ], 0)
    expect(visibleModules(eff)).toEqual(['food'])
  })

  it('пустой/мусорный вход не роняет и не выдумывает модули', () => {
    expect([...effectivePrivileges([], [], 0).keys()]).toEqual([])
    expect([...effectivePrivileges([{ module: '', privilege_code: 'access' }], [], 0).keys()]).toEqual([])
  })
})

describe('visibleModules — «видит ⇔ может войти»', () => {
  const eff = (entries: Record<string, string[]>) =>
    new Map(Object.entries(entries).map(([m, codes]) => [m, new Set(codes)]))

  it('есть access и требуемое право — модуль виден', () => {
    expect(visibleModules(eff({ maintenance: ['access', 'view'] }))).toEqual(['maintenance'])
  })

  it('ГЛАВНЫЙ СЛУЧАЙ: есть access, нет view — модуль НЕ виден (раньше был виден и не открывался)', () => {
    expect(visibleModules(eff({ maintenance: ['access'] }))).toEqual([])
  })

  it('есть view, но нет access — модуль не виден', () => {
    expect(visibleModules(eff({ maintenance: ['view', 'manage'] }))).toEqual([])
  })

  it('модулю без отдельного права страницы хватает access', () => {
    // 'finance' не в MODULE_PAGE_PRIVILEGE: его страница своего гейта не имеет.
    expect(visibleModules(eff({ finance: ['access'] }))).toEqual(['finance'])
  })

  it('manage без view не открывает модуль (страница спрашивает именно view)', () => {
    expect(visibleModules(eff({ maintenance: ['access', 'manage'] }))).toEqual([])
  })

  it('модули не влияют друг на друга', () => {
    expect(visibleModules(eff({
      maintenance: ['access'], food: ['access', 'view'], finance: ['access'],
    })).sort()).toEqual(['finance', 'food'])
  })
})

// ─── Страж: карта прав страниц не должна отставать от самих страниц ──────────

const DASHBOARD = join(process.cwd(), 'app', 'dashboard')
/** Каталог страницы ('quality-control') → код модуля ('quality_control'). */
const moduleCode = (dir: string) => dir.replace(/-/g, '_')

interface PageGate { module: string; dir: string; privilege: string | null }

function scanGatedPages(): PageGate[] {
  const out: PageGate[] = []
  for (const dir of readdirSync(DASHBOARD)) {
    const file = join(DASHBOARD, dir, 'page.tsx')
    if (!existsSync(file)) continue
    const src = readFileSync(file, 'utf8')
    // Страница «гейтит», если при отказе она уводит на главную или показывает
    // экран «нет доступа».
    const gates = src.includes("redirect('/dashboard')") || src.includes('NoModuleAccess')
    if (!gates) continue
    const m = /has[A-Za-z]+Privilege\(session,\s*'([a-z_]+)'\)/.exec(src)
    out.push({ module: moduleCode(dir), dir, privilege: m ? m[1] : null })
  }
  return out
}

describe('MODULE_PAGE_PRIVILEGE не отстаёт от страниц модулей', () => {
  const pages = scanGatedPages()

  it('страницы с гейтом вообще найдены (иначе сканер сломан)', () => {
    expect(pages.length).toBeGreaterThan(8)
  })

  it('каждая гейтящая страница либо есть в карте, либо в задокументированных исключениях', () => {
    const unmapped = pages
      .filter(p => !(p.module in MODULE_PAGE_PRIVILEGE) && !(p.module in MODULE_GATE_EXCEPTIONS))
      .map(p => `${p.dir}/page.tsx (требует '${p.privilege ?? '?'}')`)
    expect(
      unmapped,
      'Страница модуля закрывает вход правом, о котором не знает список видимых модулей — ' +
      'модуль будет ВИДЕН и не будет открываться. Добавь модуль в MODULE_PAGE_PRIVILEGE ' +
      '(или в MODULE_GATE_EXCEPTIONS с причиной):\n' + unmapped.join('\n'),
    ).toEqual([])
  })

  it('право в карте совпадает с тем, что реально требует страница', () => {
    const mismatched = pages
      .filter(p => p.module in MODULE_PAGE_PRIVILEGE && p.privilege !== null)
      .filter(p => MODULE_PAGE_PRIVILEGE[p.module] !== p.privilege)
      .map(p => `${p.dir}: карта '${MODULE_PAGE_PRIVILEGE[p.module]}', страница '${p.privilege}'`)
    expect(mismatched, `Карта разошлась со страницей:\n${mismatched.join('\n')}`).toEqual([])
  })

  it('в карте нет протухших записей (модуль без гейтящей страницы)', () => {
    const gatedModules = new Set(pages.map(p => p.module))
    const stale = Object.keys(MODULE_PAGE_PRIVILEGE).filter(m => !gatedModules.has(m))
    expect(stale, `Записи без соответствующей страницы:\n${stale.join('\n')}`).toEqual([])
  })

  it('в исключениях нет протухших записей', () => {
    const gatedModules = new Set(pages.map(p => p.module))
    const stale = Object.keys(MODULE_GATE_EXCEPTIONS).filter(m => !gatedModules.has(m))
    expect(stale, `Исключения без соответствующей страницы:\n${stale.join('\n')}`).toEqual([])
  })
})
