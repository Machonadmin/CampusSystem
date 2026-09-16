import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// ─── Страж: перестройка дерева не может менять права ─────────────────────────
//
// Весь замысел модуля держится на одном обещании владельцу: он может свободно
// таскать темы, делить их и выносить в отдельные модули, И ЭТО НИКОМУ НИЧЕГО НЕ
// ОТКРЫВАЕТ И НЕ ЗАКРЫВАЕТ. Обещание держится только потому, что дерево
// (security_tree_*) и выдача прав (role_privileges / person_privileges) —
// разные таблицы, и маршруты дерева вторых не касаются.
//
// Достаточно одной строчки «заодно выдадим права узла» в маршруте дерева, чтобы
// обещание перестало быть правдой, причём молча. Этот тест статически проверяет,
// что такой строчки нет.

const API = join(process.cwd(), 'app', 'api', 'data-security')

/** Таблицы выдачи прав: маршруты дерева не должны их даже упоминать. */
const GRANT_TABLES = ['role_privileges', 'person_privileges']

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

describe('маршруты дерева не трогают выдачу прав', () => {
  const treeRoutes = routesUnder(join(API, 'tree'))

  it('маршруты дерева вообще найдены (иначе сканер сломан)', () => {
    expect(treeRoutes.length).toBeGreaterThan(0)
  })

  it('ни один маршрут дерева не обращается к role_privileges / person_privileges', () => {
    const offenders: string[] = []
    for (const file of treeRoutes) {
      const src = readFileSync(file, 'utf8')
      for (const table of GRANT_TABLES) {
        // Упоминание в комментарии допустимо — ищем именно обращение к таблице.
        if (new RegExp(`from\\(\\s*['"\`]${table}['"\`]`).test(src)) {
          offenders.push(`${file.replace(process.cwd() + '/', '')}: ${table}`)
        }
      }
    }
    expect(
      offenders,
      'Маршрут дерева отображения обращается к таблице выдачи прав. Тогда ' +
      'перетаскивание темы начнёт менять чьи-то права — ровно то, чего этот ' +
      'модуль обещает не делать:\n' + offenders.join('\n'),
    ).toEqual([])
  })

  it('перестройка дерева требует manage_tree, а не grant', () => {
    // Иначе право «наводить порядок» давало бы и право раздавать доступы.
    for (const file of treeRoutes) {
      const src = readFileSync(file, 'utf8')
      const writes = /export async function (POST|PATCH|PUT|DELETE)/.test(src)
      if (!writes) continue
      expect(src, `${file}: пишущий маршрут дерева без проверки manage_tree`)
        .toContain("requireDataSecurityPrivilege('manage_tree')")
      expect(src, `${file}: маршрут дерева не должен требовать право выдачи`)
        .not.toContain("requireDataSecurityPrivilege('grant')")
    }
  })
})

describe('выдача прав требует отдельного права grant', () => {
  const personRoutes = routesUnder(join(API, 'person'))

  it('маршрут сотрудника найден', () => {
    expect(personRoutes.length).toBeGreaterThan(0)
  })

  it('запись личных прав закрыта правом grant', () => {
    for (const file of personRoutes) {
      const src = readFileSync(file, 'utf8')
      if (!/export async function (POST|PATCH|PUT|DELETE)/.test(src)) continue
      expect(src, `${file}: запись прав сотрудника без проверки grant`)
        .toContain("requireDataSecurityPrivilege('grant')")
    }
  })

  it('чтение закрыто правом access', () => {
    for (const file of personRoutes) {
      const src = readFileSync(file, 'utf8')
      if (!/export async function GET/.test(src)) continue
      expect(src, `${file}: чтение прав сотрудника без проверки access`)
        .toContain("requireDataSecurityPrivilege('access')")
    }
  })
})
