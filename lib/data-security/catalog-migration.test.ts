import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ─── Страж каталога прав ─────────────────────────────────────────────────────
//
// Каталог заполняется миграцией, а не кодом, поэтому обычные тесты его не
// видят. Здесь он разбирается прямо из SQL — без БД, так что проверка работает
// у всех и в CI.
//
// Проверяется то, на чём держатся обещания экрана:
//   • у каждого права есть имя и объяснение на ТРЁХ языках — иначе на экране
//     появится пустая строка или технический код, чего быть не должно;
//   • ссылка «заменено на» ведёт на существующее право — иначе экран отправит
//     администратора к тому, чего нет;
//   • уровень и риск — из допустимого набора, иначе шкала и пометки поедут.

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')

const CATALOG_FILE = readdirSync(MIGRATIONS)
  .filter(f => f.includes('module_privileges_catalog_i18n'))
  .sort()
  .at(-1)

interface Row {
  module: string
  code: string
  nameHe: string; nameRu: string; nameEn: string
  descHe: string; descRu: string; descEn: string
  level: string; risk: string
  supersededBy: string | null
}

/** Разбирает строку кортежа VALUES с учётом удвоенных кавычек внутри строк. */
function splitSqlTuple(line: string): string[] {
  const inner = line.trim().replace(/^\(/, '').replace(/\),?$/, '')
  const out: string[] = []
  let buf = ''
  let inStr = false
  let depth = 0
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (inStr) {
      if (c === "'" && inner[i + 1] === "'") { buf += "'"; i++; continue }
      if (c === "'") { inStr = false; continue }
      buf += c
      continue
    }
    if (c === "'") { inStr = true; continue }
    if (c === '[' || c === '(') depth++
    if (c === ']' || c === ')') depth--
    if (c === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue }
    buf += c
  }
  out.push(buf.trim())
  return out
}

function parseCatalog(): Row[] {
  expect(CATALOG_FILE, 'миграция каталога найдена').toBeTruthy()
  const sql = readFileSync(join(MIGRATIONS, CATALOG_FILE as string), 'utf8')

  // Берём блок UPDATE ... FROM (VALUES ...): именно он несёт подписи.
  const start = sql.indexOf('FROM (VALUES')
  const end = sql.indexOf(') AS v(module, privilege_code')
  expect(start, 'блок VALUES найден').toBeGreaterThan(-1)
  expect(end, 'конец блока VALUES найден').toBeGreaterThan(start)

  const block = sql.slice(start + 'FROM (VALUES'.length, end)
  const rows: Row[] = []
  for (const line of block.split('\n')) {
    if (!line.trim().startsWith('(')) continue
    const p = splitSqlTuple(line)
    if (p.length < 13) continue
    rows.push({
      module: p[0], code: p[1],
      nameHe: p[2], nameRu: p[3], nameEn: p[4],
      descHe: p[5], descRu: p[6], descEn: p[7],
      level: p[8], risk: p[9],
      supersededBy: p[11] === 'NULL' ? null : p[11],
    })
  }
  return rows
}

describe('каталог прав в миграции', () => {
  const rows = parseCatalog()

  it('строки разобраны (иначе сломан парсер, а не каталог)', () => {
    expect(rows.length).toBeGreaterThan(100)
  })

  it('ключ (модуль, код) уникален', () => {
    const keys = rows.map(r => `${r.module}.${r.code}`)
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i)
    expect([...new Set(dupes)]).toEqual([])
  })

  it('у каждого права есть имя на всех трёх языках', () => {
    const bad = rows
      .filter(r => !r.nameHe || !r.nameRu || !r.nameEn)
      .map(r => `${r.module}.${r.code}`)
    expect(
      bad,
      'Без имени экран покажет пустую строку или технический код — этого быть ' +
      'не должно нигде:\n' + bad.join('\n'),
    ).toEqual([])
  })

  it('у каждого права есть объяснение на всех трёх языках', () => {
    const bad = rows
      .filter(r => !r.descHe || !r.descRu || !r.descEn)
      .map(r => `${r.module}.${r.code}`)
    expect(
      bad,
      'Право без объяснения нельзя выдать осознанно: администратор видит ' +
      'название и не знает, что именно откроет:\n' + bad.join('\n'),
    ).toEqual([])
  })

  it('имя — не технический код', () => {
    // Подпись вида 'set_grades' означает, что перевод забыли.
    const bad = rows
      .filter(r => r.nameHe === r.code || r.nameRu === r.code || r.nameEn === r.code)
      .map(r => `${r.module}.${r.code}`)
    expect(bad).toEqual([])
  })

  it('уровень и риск — из допустимого набора', () => {
    const levels = new Set(['access', 'view', 'edit', 'manage'])
    const risks = new Set(['normal', 'sensitive', 'critical'])
    const badLevel = rows.filter(r => !levels.has(r.level)).map(r => `${r.module}.${r.code}=${r.level}`)
    const badRisk = rows.filter(r => !risks.has(r.risk)).map(r => `${r.module}.${r.code}=${r.risk}`)
    expect(badLevel).toEqual([])
    expect(badRisk).toEqual([])
  })

  it('«заменено на» ведёт на право, которое есть в каталоге', () => {
    const known = new Set(rows.map(r => `${r.module}.${r.code}`))
    const dangling = rows
      .filter(r => r.supersededBy)
      .filter(r => !known.has(r.supersededBy as string))
      .map(r => `${r.module}.${r.code} → ${r.supersededBy}`)
    expect(
      dangling,
      'Экран отправит администратора к праву, которого нет:\n' + dangling.join('\n'),
    ).toEqual([])
  })

  it('право не объявлено заменой самому себе', () => {
    const selfref = rows
      .filter(r => r.supersededBy === `${r.module}.${r.code}`)
      .map(r => `${r.module}.${r.code}`)
    expect(selfref).toEqual([])
  })

  it('самые чувствительные модули помечены как critical', () => {
    // Медкарты, психология и проверка еврейства — то, что в этом учреждении
    // нельзя открыть по невнимательности.
    for (const mod of ['doctor', 'psychologist', 'jewishness']) {
      const rowsOfModule = rows.filter(r => r.module === mod)
      expect(rowsOfModule.length, `права модуля ${mod} есть в каталоге`).toBeGreaterThan(0)
      const notCritical = rowsOfModule.filter(r => r.risk !== 'critical').map(r => r.code)
      expect(notCritical, `${mod}: не помечено critical`).toEqual([])
    }
    const sensitivePersons = rows.find(r => r.module === 'persons' && r.code === 'view_sensitive')
    expect(sensitivePersons?.risk).toBe('critical')
  })

  it('право выдачи прав помечено как самое чувствительное', () => {
    const grant = rows.find(r => r.module === 'data_security' && r.code === 'grant')
    expect(grant?.risk).toBe('critical')
    expect(grant?.level).toBe('manage')
  })
})
