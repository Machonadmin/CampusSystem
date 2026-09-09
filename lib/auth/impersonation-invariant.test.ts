import { describe, it, expect } from 'vitest'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Инвариант режима «צפייה כמשתמש» (impersonation, read-only).
 *
 * Read-only при имперсонации держится на ОДНОМ месте: middleware.ts блокирует
 * любой не-GET вызов `/api/**`, когда в токене стоит imp_by. Это работает ТОЛЬКО
 * пока каждая мутация проходит через `/api/**`. Server Actions Next.js
 * (`'use server'`) выполняются ВНЕ этого маршрута и middleware их не видит —
 * появись хоть одна, суперадмин в режиме просмотра смог бы менять данные от
 * имени сотрудника в обход read-only.
 *
 * Поэтому фиксируем инвариант: в кодовой базе НЕТ ни одной директивы
 * 'use server'. Если она появится — этот тест упадёт и заставит либо убрать
 * server action, либо расширить проверку read-only в middleware.
 */

const ROOTS = ['app', 'lib', 'components']
const EXTS = new Set(['.ts', '.tsx'])

function walk(dir: string): string[] {
  let out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    const s = statSync(p)
    if (s.isDirectory()) out = out.concat(walk(p))
    else if (EXTS.has(p.slice(p.lastIndexOf('.')))) out.push(p)
  }
  return out
}

// Директива 'use server' — только когда стоит первой (модульная) или как строка-
// оператор в начале строки. Матчим строку, состоящую целиком из директивы.
const USE_SERVER = /^\s*['"]use server['"]\s*;?\s*$/m

describe('impersonation read-only invariant', () => {
  it('no "use server" directive exists (all mutations go through /api/** choke point)', () => {
    const offenders: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(join(process.cwd(), root))) {
        if (USE_SERVER.test(readFileSync(file, 'utf8'))) {
          offenders.push(file.slice(process.cwd().length + 1))
        }
      }
    }
    expect(
      offenders,
      `Server Actions bypass the impersonation read-only guard in middleware.ts. ` +
      `Either remove the server action, or extend the read-only enforcement:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
