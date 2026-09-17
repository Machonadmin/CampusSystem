import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Гигиена миграций. Миграции применяются ВРУЧНУЮ в Supabase по возрастанию
 * имени файла, поэтому порядковый префикс имени = ключ порядка. Две миграции с
 * ОДИНАКОВЫМ префиксом (напр. две с одним timestamp) применились бы в
 * неопределённом порядке — тихий баг. Этот тест ловит такую ошибку до мержа.
 *
 * Допускаются обе схемы имён в репозитории: ранние `001_...`, `002_...` и
 * поздние 14-значные timestamp `20260717120000_...`. Проверяем не формат, а
 * УНИКАЛЬНОСТЬ порядкового префикса и наличие префикса вообще.
 */
const DIR = join(process.cwd(), 'supabase', 'migrations')
const files = readdirSync(DIR).filter(f => f.endsWith('.sql'))

describe('migration hygiene', () => {
  it('there are migration files', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('filenames are unique', () => {
    expect(new Set(files).size).toBe(files.length)
  })

  it('every migration has a numeric order-prefix', () => {
    const bad = files.filter(f => !/^\d+_/.test(f))
    expect(bad, `files without a leading numeric prefix: ${bad.join(', ')}`).toEqual([])
  })

  it('order-prefixes are unique (no two migrations share an ordering key)', () => {
    const prefixes = files.map(f => f.match(/^\d+/)?.[0] ?? f)
    const seen = new Set<string>()
    const dupes = new Set<string>()
    for (const p of prefixes) { if (seen.has(p)) dupes.add(p); else seen.add(p) }
    expect([...dupes], `duplicate migration order-prefixes: ${[...dupes].join(', ')}`).toEqual([])
  })
})

// ─── RLS на новых таблицах ───────────────────────────────────────────────────
//
// Миграция 20260908120000 включила RLS на КАЖДОЙ таблице схемы public без
// политик: приложение ходит в Supabase только с сервера под service_role,
// который RLS полностью обходит, а anon/authenticated закрыты наглухо. Там же
// сказано прямым текстом: новые таблицы обязаны включать RLS.
//
// Забыть эту строку легко, и последствие тихое: таблица остаётся читаемой
// публичным ключом в обход приложения. Supabase предупреждает об этом в
// редакторе («creates tables without enabling Row Level Security»), но
// предупреждение можно пролистать — поэтому проверяем здесь.
//
// Проверяются только миграции ПОСЛЕ той, что ввела правило: более ранние
// накрыты её сплошным проходом по pg_tables.
const RLS_RULE_MIGRATION = '20260908120000'

describe('RLS на таблицах, созданных после введения правила', () => {
  const laterFiles = files.filter(f => (/^(\d+)_/.exec(f)?.[1] ?? '') > RLS_RULE_MIGRATION)

  it('такие миграции вообще есть (иначе тест бесполезен)', () => {
    expect(laterFiles.length).toBeGreaterThan(0)
  })

  it('каждая созданная таблица public включает RLS в той же миграции', () => {
    const offenders: string[] = []
    for (const file of laterFiles) {
      const sql = readFileSync(join(DIR, file), 'utf8')
      // Имена создаваемых таблиц (без схемы и без временных).
      const created = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)]
        .map(m => m[1])
        .filter(t => !/^temp_|^tmp_/.test(t))
      for (const table of [...new Set(created)]) {
        const enabled = new RegExp(
          `ALTER\\s+TABLE\\s+(?:public\\.)?"?${table}"?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i',
        ).test(sql)
        if (!enabled) offenders.push(`${file}: ${table}`)
      }
    }
    expect(
      offenders,
      'Таблица создана без ENABLE ROW LEVEL SECURITY в той же миграции. ' +
      'Она останется доступной публичным ключом в обход приложения:\n' + offenders.join('\n'),
    ).toEqual([])
  })
})
