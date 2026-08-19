import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
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
