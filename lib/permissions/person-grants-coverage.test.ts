import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ─── Страж: ни одна проверка прав не слепа к личным выдачам ──────────────────
//
// Так и случилось однажды. lib/auth/module-privileges.ts читал ТОЛЬКО
// role_privileges, а гейт модуля (lib/permissions/module-gates.ts) — ещё и
// person_privileges. Пока права жили на должностях, расхождение было незаметно.
// Как только владелец снял права с должностей и перевёл их на людей, оно стало
// поломкой самого неприятного вида: плитка модуля в меню ЕСТЬ, а экран за ней
// отдаёт 403. Человек видит дверь, которая не открывается.
//
// Сам контракт («личная выдача открывает доступ») проверяется ПОВЕДЕНЧЕСКИ в
// lib/auth/module-privileges.test.ts. Первая версия стража была статической —
// «файл упоминает applyPersonGrants» — и не поймала откат: импорты остались, а
// логика исчезла. Здесь остаётся только то, что статикой проверяется честно:
// новый маршрут не должен заводить ТРЕТЬЮ проверку прав в обход обеих.

const ROOT = process.cwd()

const readsRolePrivileges = (src: string) => /from\(\s*['"`]role_privileges['"`]/.test(src)

// ─── Ни один маршрут не должен появиться в обход обоих механизмов ────────────

describe('маршруты не проверяют права в обход общих механизмов', () => {
  function routesUnder(dir: string): string[] {
    let out: string[] = []
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) out = out.concat(routesUnder(p))
      else if (entry === 'route.ts') out.push(p)
    }
    return out
  }

  // Читать role_privileges маршруту можно в двух случаях, и оба — не решение о
  // доступе, а работа С САМИМИ ДАННЫМИ. Каждый записан с причиной, чтобы новый
  // файл не проскользнул сюда молча.
  const ALLOWED: Readonly<Record<string, string>> = {
    'app/api/settings/role-privileges/route.ts':
      'Это и есть CRUD прав должности: таблица здесь — предмет работы, а не источник решения.',
    'app/api/staff/health/route.ts':
      'Диагностика: показывает, какие модули открывает каждая должность. Ничего не решает.',
  }

  it('маршрут, читающий role_privileges, читает и person_privileges', () => {
    const offenders: string[] = []
    for (const file of routesUnder(join(ROOT, 'app', 'api'))) {
      const rel = file.replace(ROOT + '/', '')
      if (rel in ALLOWED) continue
      const src = readFileSync(file, 'utf8')
      if (!readsRolePrivileges(src)) continue
      if (!/from\(\s*['"`]person_privileges['"`]/.test(src)) offenders.push(rel)
    }

    expect(
      offenders,
      'Маршрут решает доступ сам, читая ТОЛЬКО права должности. Он не увидит ' +
      'личных выдач и разойдётся с остальной системой:\n' + offenders.join('\n'),
    ).toEqual([])
  })
})
