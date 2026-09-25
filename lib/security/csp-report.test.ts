import { describe, it, expect } from 'vitest'
import { parseCspReports, mergeCspEntries, MAX_ENTRIES, type CspEntry } from './csp-report'

describe('parseCspReports', () => {
  it('формат report-uri: адреса без query-строк, внешний ресурс — до origin', () => {
    const v = parseCspReports({
      'csp-report': {
        'document-uri': 'https://campus.example/dashboard/persons/123?token=SECRET',
        'violated-directive': 'script-src-elem',
        'effective-directive': 'script-src-elem',
        'blocked-uri': 'https://evil.example/x.js?k=1',
        'source-file': 'https://campus.example/_next/static/chunks/a.js?v=2',
      },
    })
    expect(v).toEqual([{
      directive: 'script-src-elem',
      blocked: 'https://evil.example',
      page: '/dashboard/persons/123',
      source: 'https://campus.example/_next/static/chunks/a.js',
    }])
    expect(JSON.stringify(v)).not.toContain('SECRET')
  })

  it('формат report-to (массив), чужие типы отчётов пропускаются', () => {
    const v = parseCspReports([
      { type: 'csp-violation', body: { documentURL: 'https://c.example/login', effectiveDirective: 'connect-src', blockedURL: 'https://api.other.example/track' } },
      { type: 'deprecation', body: { id: 'x' } },
      { type: 'csp-violation', body: { documentURL: 'https://c.example/', effectiveDirective: 'script-src', blockedURL: 'eval' } },
    ])
    expect(v.map(x => [x.directive, x.blocked, x.page])).toEqual([
      ['connect-src', 'https://api.other.example', '/login'],
      ['script-src', 'eval', '/'],
    ])
  })

  it('data:/blob: сводятся к схеме, мусор — пустой список', () => {
    expect(parseCspReports({ 'csp-report': { 'violated-directive': 'img-src', 'blocked-uri': 'data:image/png;base64,AAAA', 'document-uri': 'https://c/x' } })[0].blocked).toBe('data')
    expect(parseCspReports('nope')).toEqual([])
    expect(parseCspReports({ 'csp-report': {} })).toEqual([])
  })
})

describe('mergeCspEntries', () => {
  const v = { directive: 'script-src', blocked: 'https://e', page: '/p' }

  it('повтор увеличивает счётчик, новое — добавляется', () => {
    const t1 = new Date('2026-09-25T10:00:00Z')
    const t2 = new Date('2026-09-25T11:00:00Z')
    let list = mergeCspEntries([], [v], t1)
    list = mergeCspEntries(list, [v, { ...v, page: '/q' }], t2)
    expect(list).toHaveLength(2)
    const same = list.find(e => e.page === '/p')!
    expect(same.count).toBe(2)
    expect(same.first_seen).toBe(t1.toISOString())
    expect(same.last_seen).toBe(t2.toISOString())
  })

  it(`хранит не больше ${MAX_ENTRIES} записей, вытесняя самые давние`, () => {
    const old: CspEntry[] = Array.from({ length: MAX_ENTRIES }, (_, i) => ({
      ...v, page: `/old${i}`, count: 1, first_seen: '2026-01-01T00:00:00Z', last_seen: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}Z`,
    }))
    const list = mergeCspEntries(old, [{ ...v, page: '/new' }], new Date('2026-09-25T00:00:00Z'))
    expect(list).toHaveLength(MAX_ENTRIES)
    expect(list[0].page).toBe('/new')
  })
})
