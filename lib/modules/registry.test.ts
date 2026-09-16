import { describe, it, expect } from 'vitest'
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { translations } from '@/lib/i18n/translations'
import {
  MODULES,
  PROTECTED_MODULE_CODES,
  ALL_MODULE_CODES,
  MODULE_PAGE_PRIVILEGE,
  MODULE_GATE_EXCEPTIONS,
  COLOURED_MODULE_CODES,
  IMPLEMENTED_MODULE_CODES,
  PRIVILEGE_MODULE_CODES,
  SIDEBAR_MODULES,
  getModule,
  moduleCodeFromSegment,
} from './registry'

// Реестр модулей заменил четыре разошедшихся списка. Эти тесты — страж: они
// ПРИБИВАЮТ производные списки к тем значениям, что были до объединения, чтобы
// «наведение порядка» не поменяло молча ничьи права, и следят, чтобы новый
// экран модуля не появился в обход реестра.

describe('реестр внутренне согласован', () => {
  it('коды уникальны', () => {
    const codes = MODULES.map(m => m.code)
    expect(codes.length).toBe(new Set(codes).size)
  })

  it('у каждого модуля есть подпись на всех трёх языках', () => {
    const missing: string[] = []
    for (const m of MODULES) {
      for (const lang of ['ru', 'he', 'en'] as const) {
        const label = translations[lang].nav[m.navKey]
        if (!label) missing.push(`${m.code} → nav.${m.navKey} (${lang})`)
      }
    }
    expect(
      missing,
      'Подпись модуля берётся из translations.<lang>.nav. Без неё в меню будет ' +
      'пусто или технический код — а по требованию владельца технический код на ' +
      'экране не показывается никогда:\n' + missing.join('\n'),
    ).toEqual([])
  })

  it('модуль с отдельным правом страницы обязан эту страницу гейтить', () => {
    const bad = MODULES.filter(m => m.pagePrivilege && !m.pageGates).map(m => m.code)
    expect(bad).toEqual([])
  })

  it('исключение из гейта описано причиной', () => {
    const bad = MODULES
      .filter(m => m.pageGates && !m.pagePrivilege && !m.gateExceptionReason)
      .map(m => m.code)
    expect(bad, `Нужна причина, почему странице хватает 'access':\n${bad.join('\n')}`).toEqual([])
  })

  it('модуль в сайдбаре имеет маршрут и считается реализованным', () => {
    const bad = SIDEBAR_MODULES.filter(m => !m.href || !m.implemented).map(m => m.code)
    expect(bad).toEqual([])
  })

  it('маршрут /dashboard/<segment> приводится к коду модуля', () => {
    expect(moduleCodeFromSegment('quality-control')).toBe('quality_control')
    expect(moduleCodeFromSegment('data-security')).toBe('data_security')
    expect(moduleCodeFromSegment('finance')).toBe('finance')
  })

  it('getModule находит по коду и не выдумывает несуществующее', () => {
    expect(getModule('finance')?.navKey).toBe('finance')
    expect(getModule('нет-такого')).toBeUndefined()
  })
})

// ─── Страж: производные списки == то, что было до объединения ────────────────
//
// Значения ниже переписаны с исходных файлов ДО рефакторинга. Расхождения между
// ними (в middleware нет 'tasks', в типе не было 'staff') сохранены намеренно:
// задача объединения — убрать дублирование, а НЕ поменять поведение. Любая
// правка состава — отдельное решение, и тогда правится и этот список.

describe('производные списки не изменились после объединения', () => {
  it('PROTECTED_MODULE_CODES == прежний middleware.ts → PROTECTED_MODULES', () => {
    expect([...PROTECTED_MODULE_CODES].sort()).toEqual([
      'alumni', 'contacts', 'data_security', 'documents', 'doctor', 'dormitory',
      'education', 'finance', 'food', 'jewishness', 'maintenance', 'persons',
      'psychologist', 'quality_control', 'reports', 'security', 'settings',
      'sponsors', 'staff',
    ].sort())
  })

  it('ALL_MODULE_CODES == прежний /api/auth/me → ALL_MODULE_CODES', () => {
    expect([...ALL_MODULE_CODES].sort()).toEqual([
      'alumni', 'contacts', 'data_security', 'documents', 'doctor', 'dormitory',
      'education', 'finance', 'food', 'jewishness', 'maintenance', 'persons',
      'psychologist', 'quality_control', 'reports', 'security', 'settings',
      'sponsors', 'staff', 'tasks',
    ].sort())
  })

  it("MODULE_PAGE_PRIVILEGE == прежняя карта (11 модулей, все — 'view')", () => {
    expect(MODULE_PAGE_PRIVILEGE).toEqual({
      contacts: 'view', doctor: 'view', documents: 'view', dormitory: 'view',
      food: 'view', maintenance: 'view', persons: 'view', psychologist: 'view',
      reports: 'view', security: 'view', sponsors: 'view',
    })
  })

  it('MODULE_GATE_EXCEPTIONS == прежние два исключения плюс новый модуль', () => {
    // health и jewishness были и до объединения; data_security добавлен вместе с
    // самим модулем — его страница гейтится тем же 'access', что и видимость.
    expect(Object.keys(MODULE_GATE_EXCEPTIONS).sort()).toEqual(['data_security', 'health', 'jewishness'])
  })

  it('COLOURED_MODULE_CODES == токены --mod-* в globals.css', () => {
    // Сверяем с САМИМ CSS, а не со списком-копией: у `studies` своего токена нет
    // (module-colors держит synonym studies → education), и пометка hasColour
    // увела бы tokenBase() на несуществующую переменную — то есть в серый
    // fallback. Такую ошибку список-копия не ловит, а этот тест ловит.
    const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8')
    const tokens = new Set(
      [...css.matchAll(/--mod-([a-z_]+):/g)].map(m => m[1]).filter(c => c !== 'fallback'),
    )
    const missingToken = COLOURED_MODULE_CODES.filter(c => !tokens.has(c))
    expect(
      missingToken,
      'Модуль помечен hasColour, но переменной --mod-<code> в globals.css нет — ' +
      'цвет молча станет серым fallback:\n' + missingToken.join('\n'),
    ).toEqual([])

    const unclaimed = [...tokens].filter(c => !COLOURED_MODULE_CODES.includes(c))
    expect(
      unclaimed,
      'В globals.css есть палитра модуля, которого нет в реестре с hasColour:\n' +
      unclaimed.join('\n'),
    ).toEqual([])
  })

  it('IMPLEMENTED_MODULE_CODES == прежний IMPLEMENTED_MODULES + новый модуль', () => {
    expect([...IMPLEMENTED_MODULE_CODES].sort()).toEqual([
      'alumni', 'chavruta', 'contacts', 'data_security', 'doctor', 'documents',
      'dormitory', 'education', 'finance', 'food', 'health', 'jewishness',
      'maintenance', 'persons', 'psychologist', 'quality_control', 'reports',
      'security', 'settings', 'sponsors', 'staff', 'tasks',
    ].sort())
  })

  it('PRIVILEGE_MODULE_CODES покрывает прежний тип PrivilegeModule целиком', () => {
    // Прежний union из types/database.ts. Реестр его РАСШИРЯЕТ (staff,
    // quality_control, recruitment, admission, studies реально живут в
    // role_privileges, но в типе отсутствовали) — сузить он не имеет права.
    const previousUnion = [
      'persons', 'applicants', 'education', 'jewishness', 'finance', 'dormitory',
      'food', 'maintenance', 'security', 'doctor', 'psychologist', 'alumni',
      'sponsors', 'tasks', 'documents', 'reports', 'settings', 'contacts', 'chavruta',
    ]
    const lost = previousUnion.filter(c => !PRIVILEGE_MODULE_CODES.includes(c))
    expect(lost, `Из типа модулей прав пропали коды:\n${lost.join('\n')}`).toEqual([])
  })

  it('коды, которые выдаёт миграция 20260708140000, — модули прав', () => {
    // Иначе их нельзя сохранить через типизированный клиент Supabase.
    for (const code of ['staff', 'quality_control']) {
      expect(PRIVILEGE_MODULE_CODES, code).toContain(code)
    }
  })

  it('коды разделения матрицы учёбы — модули прав', () => {
    // lib/education/permissions.ts читает права из всех четырёх (EDU_PRIV_MODULES).
    for (const code of ['education', 'recruitment', 'admission', 'studies']) {
      expect(PRIVILEGE_MODULE_CODES, code).toContain(code)
    }
  })
})

// ─── Страж: экран модуля не может появиться в обход реестра ──────────────────

const DASHBOARD = join(process.cwd(), 'app', 'dashboard')

function scanDashboardModules(): string[] {
  return readdirSync(DASHBOARD, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(DASHBOARD, e.name, 'page.tsx')))
    .map(e => moduleCodeFromSegment(e.name))
}

describe('реестр не отстаёт от экранов', () => {
  const screens = scanDashboardModules()

  it('экраны вообще найдены (иначе сканер сломан)', () => {
    expect(screens.length).toBeGreaterThan(10)
  })

  it('у каждого экрана /dashboard/<x> есть запись в реестре', () => {
    const unknown = screens.filter(code => !getModule(code))
    expect(
      unknown,
      'Появился экран модуля, которого нет в lib/modules/registry.ts. Без записи ' +
      'модуль не попадёт ни в middleware, ни в сайдбар, ни в «Безопасность данных» ' +
      '— то есть будет либо не закрыт, либо невидим:\n' + unknown.join('\n'),
    ).toEqual([])
  })

  it('href в реестре указывает на существующий экран', () => {
    const broken = MODULES
      .filter(m => m.href?.startsWith('/dashboard/'))
      .filter(m => !existsSync(join(DASHBOARD, m.href!.slice('/dashboard/'.length), 'page.tsx')))
      .map(m => `${m.code} → ${m.href}`)
    expect(broken, `Маршрут без экрана:\n${broken.join('\n')}`).toEqual([])
  })

  it('pageGates совпадает с тем, гейтит ли страница на самом деле', () => {
    const mismatched: string[] = []
    for (const m of MODULES) {
      if (!m.href?.startsWith('/dashboard/')) continue
      const file = join(DASHBOARD, m.href.slice('/dashboard/'.length), 'page.tsx')
      if (!existsSync(file)) continue
      const src = readFileSync(file, 'utf8')
      const gates = src.includes("redirect('/dashboard')") || src.includes('NoModuleAccess')
      if (gates !== m.pageGates) {
        mismatched.push(`${m.code}: реестр ${m.pageGates}, страница ${gates}`)
      }
    }
    expect(mismatched, `Реестр разошёлся со страницей:\n${mismatched.join('\n')}`).toEqual([])
  })
})
