import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// ─── Стражи разделения прав модуля ───────────────────────────────────────────
//
// Весь замысел «Безопасности данных» держится на трёх РАЗНЫХ по опасности
// действиях, которые нельзя смешивать:
//
//   manage_tree  — перестановка дерева ОТОБРАЖЕНИЯ. Безопасна: экран
//                  перекладывается, права не меняются ни у кого.
//   manage_units — правка оргструктуры и посадки людей. Опасна иначе: меняет,
//                  КОГО человек видит, вообще не выдавая ему прав.
//   grant        — выдача и отзыв прав человеку. Самое сильное.
//
// Склейка любых двух означала бы, что одно выдаётся незаметно вместе с другим:
// «наведи порядок на экране» превратилось бы в «переопредели, кто что видит».
// Проверка статическая — по исходникам маршрутов, без запуска.

const API = join(process.cwd(), 'app', 'api', 'data-security')

function routesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  let out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out = out.concat(routesUnder(p))
    else if (entry === 'route.ts') out.push(p)
  }
  return out
}

const short = (file: string) => file.replace(process.cwd() + '/', '')

/** Обращается ли исходник к таблице (любым способом, включая чтение). */
function touchesTable(src: string, table: string): boolean {
  return new RegExp('from\\(\\s*[\'"`]' + table + '[\'"`]').test(src)
}

/** Пишет ли исходник в таблицу: from('t') ... .insert/.update/.upsert/.delete */
function writesTable(src: string, table: string): boolean {
  const re = new RegExp(
    'from\\(\\s*[\'"`]' + table + '[\'"`]\\s*\\)[\\s\\S]{0,200}?\\.(insert|update|upsert|delete)\\(',
  )
  return re.test(src)
}

const isWriteRoute = (src: string) =>
  /export async function (POST|PATCH|PUT|DELETE)/.test(src)

// ─── 1. Дерево отображения не касается выдачи прав ───────────────────────────

describe('маршруты дерева отображения не трогают выдачу прав', () => {
  const treeRoutes = routesUnder(join(API, 'tree'))

  it('маршруты дерева найдены (иначе сломан сканер)', () => {
    expect(treeRoutes.length).toBeGreaterThan(0)
  })

  it('ни один не обращается к role_privileges / person_privileges', () => {
    const offenders: string[] = []
    for (const file of treeRoutes) {
      const src = readFileSync(file, 'utf8')
      for (const table of ['role_privileges', 'person_privileges']) {
        if (touchesTable(src, table)) offenders.push(`${short(file)}: ${table}`)
      }
    }
    expect(
      offenders,
      'Маршрут дерева отображения обращается к таблице выдачи прав. Тогда ' +
      'перетаскивание темы начнёт менять чьи-то права — ровно то, чего этот ' +
      'модуль обещает не делать:\n' + offenders.join('\n'),
    ).toEqual([])
  })

  it('ни один не трогает оргструктуру и посадку', () => {
    // Иначе «перетащил тему на экране» тихо стало бы «перенёс единицу»,
    // а это меняет, кого люди видят.
    const offenders: string[] = []
    for (const file of treeRoutes) {
      const src = readFileSync(file, 'utf8')
      for (const table of ['departments', 'staff_positions']) {
        if (writesTable(src, table)) offenders.push(`${short(file)}: ${table}`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })
})

// ─── 2. Каждая таблица закрыта СВОИМ правом ──────────────────────────────────
//
// Первая версия этого стража требовала 'grant' от любого пишущего маршрута под
// person/ — и немедленно ошиблась на маршруте посадки, который обязан требовать
// manage_units. Правило переписано на то, которое действительно нужно: право
// определяется ТАБЛИЦЕЙ, в которую маршрут пишет.

const REQUIRED_BY_TABLE: Readonly<Record<string, string>> = {
  person_privileges: 'grant',
  staff_positions: 'manage_units',
  departments: 'manage_units',
  security_tree_nodes: 'manage_tree',
  security_tree_items: 'manage_tree',
}

describe('право маршрута соответствует таблице, в которую он пишет', () => {
  const all = routesUnder(API)

  it('маршруты модуля найдены', () => {
    expect(all.length).toBeGreaterThan(3)
  })

  it('каждый пишущий маршрут требует право своей таблицы', () => {
    const problems: string[] = []
    for (const file of all) {
      const src = readFileSync(file, 'utf8')
      if (!isWriteRoute(src)) continue
      for (const [table, need] of Object.entries(REQUIRED_BY_TABLE)) {
        if (!writesTable(src, table)) continue
        if (!src.includes(`requireDataSecurityPrivilege('${need}')`)) {
          problems.push(`${short(file)}: пишет в ${table}, но не требует '${need}'`)
        }
      }
    }
    expect(
      problems,
      'Действие закрыто не тем правом — значит, одно право молча даёт другое:\n' +
      problems.join('\n'),
    ).toEqual([])
  })

  it('чтение прав сотрудника закрыто правом access', () => {
    for (const file of routesUnder(join(API, 'person'))) {
      const src = readFileSync(file, 'utf8')
      if (!/export async function GET/.test(src)) continue
      expect(src, `${short(file)}: чтение без проверки access`)
        .toContain("requireDataSecurityPrivilege('access')")
    }
  })

  it('посадка требует manage_units и НЕ требует grant', () => {
    // Посадка меняет то, что человек видит, не выдавая ему прав. И наоборот:
    // право выдачи не должно молча давать право пересаживать людей.
    const seat = all.find(f => f.includes('/seat/'))
    expect(seat, 'маршрут посадки найден').toBeTruthy()
    const src = readFileSync(seat as string, 'utf8')
    expect(src).toContain("requireDataSecurityPrivilege('manage_units')")
    expect(src).not.toContain("requireDataSecurityPrivilege('grant')")
  })

  it('правка оргструктуры требует manage_units и НЕ требует manage_tree', () => {
    const units = all.find(f => f.endsWith('/units/route.ts'))
    expect(units, 'маршрут единиц найден').toBeTruthy()
    const src = readFileSync(units as string, 'utf8')
    expect(src).toContain("requireDataSecurityPrivilege('manage_units')")
    expect(src).not.toContain("requireDataSecurityPrivilege('manage_tree')")
  })
})
