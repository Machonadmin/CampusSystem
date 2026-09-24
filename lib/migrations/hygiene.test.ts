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

// ─── Порядок прав в каталоге должен быть определённым ────────────────────────
//
// module_privileges.sort_order задаёт порядок прав на экране. Два права одного
// модуля с ОДИНАКОВЫМ sort_order Postgres возвращает в произвольном порядке, и
// он может отличаться от запроса к запросу: на экране они молча меняются
// местами. Для модуля, который существует ради «навели порядок и стало
// понятно», это прямое противоречие замыслу.
//
// Так уже случилось дважды, и оба раза по-разному:
//   • 20260916120000 дала data_security.manage_tree 303 счётчиком, а
//     20260917120000 присвоила 303 же вручную manage_units — столкновение
//     ВИДНО В ТЕКСТАХ, его ловит этот тест;
//   • в 13 модулях новая строка 'access' встала на место старой 'view' — это
//     столкновение в текстах НЕ ВИДНО, потому что INSERT ... ON CONFLICT DO
//     NOTHING применяет sort_order только к новым строкам, а существующие
//     сохраняют старые значения. Поймано самопроверкой на рабочей базе.
//
// Отсюда два разных механизма защиты, и важно не путать их:
//   в тексте    — этот тест;
//   по факту    — DO-блок внутри 20260917130000, считающий дубли в самой базе.
//
// 20260917130000 пересчитывает порядок ВСЕХ строк по правилу (access → 0,
// view → 100+n, edit → 200+n, manage → 300+n), поэтому литеральные номера из
// более ранних миграций после неё уже ничего не решают. Тест это учитывает:
// проверяются только миграции ПОСЛЕ последнего пересчёта.
describe('порядок прав в каталоге определён однозначно', () => {
  /** Миграция, пересчитывающая порядок всего каталога окном row_number(). */
  const isRecompute = (sql: string) =>
    /UPDATE\s+module_privileges/i.test(sql) &&
    /sort_order/i.test(sql) &&
    /row_number\(\)\s+OVER/i.test(sql)

  const sorted = files.slice().sort()
  const recomputeIdx = sorted.map(f => isRecompute(readFileSync(join(DIR, f), 'utf8')))
    .lastIndexOf(true)

  it('пересчёт порядка в репозитории есть', () => {
    expect(
      recomputeIdx,
      'Ни одна миграция не пересчитывает sort_order по правилу. Тогда порядок ' +
      'в базе — историческая смесь, и столкновения будут возвращаться.',
    ).toBeGreaterThan(-1)
  })

  it('после пересчёта никто не назначает номера вручную со столкновением', () => {
    const after = sorted.slice(recomputeIdx + 1)
    const assigned = new Map<string, string[]>()
    for (const file of after) {
      const sql = readFileSync(join(DIR, file), 'utf8')
      for (const m of sql.matchAll(/\(\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'[^']*'\s*,\s*(-?\d+)\s*\)/g)) {
        const key = `${m[1]}::${m[3]}`
        assigned.set(key, [...(assigned.get(key) ?? []), m[2]])
      }
    }
    const collisions = [...assigned.entries()]
      .filter(([, codes]) => new Set(codes).size > 1)
      .map(([key, codes]) => `${key} → ${[...new Set(codes)].join(' = ')}`)
    expect(
      collisions,
      'Новая миграция задаёт sort_order, который уже занят в том же модуле. ' +
      'Либо возьмите свободный номер, либо пересчитайте порядок по правилу:\n' +
      collisions.join('\n'),
    ).toEqual([])
  })

  it('пересчёт покрывает и раскладку дерева отображения', () => {
    // Иначе право «прыгало» бы внутри своего узла независимо от каталога.
    const sql = readFileSync(join(DIR, sorted[recomputeIdx]), 'utf8')
    expect(sql).toMatch(/UPDATE\s+security_tree_items/i)
  })
})

// ─── SECURITY DEFINER-функции не должны быть открыты публичному ключу ─────────
//
// Функции public по умолчанию исполнимы для PUBLIC, и PostgREST отдаёт их как
// /rest/v1/rpc/<имя>. Обычная функция (SECURITY INVOKER) под публичным ключом
// упирается в RLS deny-all и ничего не видит, а SECURITY DEFINER выполняется с
// правами владельца — мимо RLS. Так verify_login из миграции 004 отдавала хэш
// пароля любого сотрудника; её убрала 20260923200000, она же отозвала EXECUTE у
// PUBLIC/anon/authenticated на все функции, существовавшие на тот момент.
//
// Новые функции снова получают EXECUTE для PUBLIC автоматически (это глобальное
// правило Postgres, схемой его не отменить). Поэтому каждая более поздняя
// миграция, создающая SECURITY DEFINER-функцию, обязана в том же файле
// отозвать у неё EXECUTE для PUBLIC.
const RPC_RULE_MIGRATION = '20260923200000'

describe('SECURITY DEFINER-функции после 20260923200000 закрыты от PUBLIC', () => {
  const laterFiles = files.filter(f => (/^(\d+)_/.exec(f)?.[1] ?? '') > RPC_RULE_MIGRATION)

  it('каждая SECURITY DEFINER-функция отзывает EXECUTE у PUBLIC в той же миграции', () => {
    const offenders: string[] = []
    for (const file of laterFiles) {
      const sql = readFileSync(join(DIR, file), 'utf8')
      if (!/SECURITY\s+DEFINER/i.test(sql)) continue
      const names = [...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)]
        .map(m => m[1])
      for (const fn of [...new Set(names)]) {
        const revoked = new RegExp(
          `REVOKE\\s+(?:ALL|EXECUTE)[\\s\\S]*?ON\\s+FUNCTION\\s+(?:public\\.)?"?${fn}"?[\\s\\S]*?FROM[^;]*\\bPUBLIC\\b`, 'i',
        ).test(sql)
        if (!revoked) offenders.push(`${file}: ${fn}`)
      }
    }
    expect(
      offenders,
      'Миграция создаёт SECURITY DEFINER-функцию и не отзывает EXECUTE у PUBLIC. ' +
      'Добавьте: REVOKE EXECUTE ON FUNCTION public.<имя>(<аргументы>) FROM PUBLIC, anon, authenticated;\n' +
      offenders.join('\n'),
    ).toEqual([])
  })
})
