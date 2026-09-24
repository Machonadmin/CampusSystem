import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ─── Страж удалённых колонок ─────────────────────────────────────────────────
//
// Здесь проверка НАРОЧНО текстовая, в отличие от остальных стражей проекта.
// Имя колонки живёт в строке — `.select('id, head_person_id')`, — и tsc про неё
// не знает ничего. Забытый select переживает и сборку, и тесты, а ломается уже
// на живой базе: PostgREST возвращает ошибку, экран показывает «ошибка
// загрузки», и связать её с миграцией, прошедшей неделю назад, почти нечем.
//
// Поэтому: ни одного упоминания удалённой колонки в коде, кроме комментариев,
// которые объясняют, почему её больше нет.

const DROPPED: Array<{ column: string; migration: string }> = [
  // Второе поле «глава единицы». Настоящее — staff_positions.is_head.
  { column: 'head_person_id', migration: '20260923120000_departments_head_person_id_drop.sql' },
]

const ROOTS = ['app', 'lib', 'components', 'types']
const EXT = /\.(ts|tsx)$/
// Тесты исключены НАМЕРЕННО: hierarchy.test.ts кладёт удалённую колонку в
// фикстуру как мину — чтобы доказать, что код её игнорирует. Запрет на имя
// сделал бы это доказательство невозможным.
const SKIP = /\.test\.(ts|tsx)$/

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (EXT.test(name) && !SKIP.test(name)) out.push(full)
  }
  return out
}

/** Строка — комментарий? Достаточно начала: имена колонок живут в коде, а не в jsdoc. */
function isComment(line: string): boolean {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

describe('удалённые колонки не упоминаются в коде', () => {
  for (const { column, migration } of DROPPED) {
    it(`${column} (удалена миграцией ${migration})`, () => {
      const hits: string[] = []
      for (const root of ROOTS) {
        for (const file of sourceFiles(root)) {
          const lines = readFileSync(file, 'utf8').split('\n')
          lines.forEach((line, i) => {
            if (!line.includes(column)) return
            if (isComment(line)) return
            hits.push(`${file}:${i + 1}: ${line.trim()}`)
          })
        }
      }
      expect(hits).toEqual([])
    })
  }
})
