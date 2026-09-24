import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Проводка: маршрут /api/data-security/person/[personId] для главы отдела ─
//
// head-scope.test.ts проверяет чистые функции; этот файл — что маршрут их
// действительно вызывает и что отказ случается ДО записи в БД:
//   GET — глава видит только свою команду;
//   PUT — только своя команда, только свои права, чужие строки не трогаются.
// Сессия и Supabase подменены; заглушка Supabase — крошечная «БД в памяти»:
// фильтры eq/in/is применяются к строкам таблиц, delete/insert записываются.

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ getSession: getSessionMock }))
// Язык читается из cookie запроса — вне Next его нет.
vi.mock('@/lib/i18n/locale', () => ({ getCookieLocale: () => 'he' }))

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  writes: [] as { table: string; op: 'delete' | 'insert'; filters: [string, string, unknown][]; rows?: unknown }[],
}))

function makeChain(table: string): unknown {
  const filters: [string, string, unknown][] = []
  let op: 'select' | 'delete' | 'insert' = 'select'
  let single = false
  const resolve = () => {
    if (op === 'delete') {
      db.writes.push({ table, op, filters: [...filters] })
      return { data: null, error: null }
    }
    let rows = db.tables[table] ?? []
    for (const [kind, col, val] of filters) {
      if (kind === 'eq') rows = rows.filter(r => r[col] === val)
      else if (kind === 'in') rows = rows.filter(r => (val as unknown[]).includes(r[col]))
      else if (kind === 'is') rows = rows.filter(r => (r[col] ?? null) === val)
    }
    return { data: single ? (rows[0] ?? null) : rows, error: null }
  }
  const proxy: unknown = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        const p = Promise.resolve(resolve())
        return p.then.bind(p)
      }
      return (...args: unknown[]) => {
        if (prop === 'eq' || prop === 'in' || prop === 'is') filters.push([prop, args[0] as string, args[1]])
        else if (prop === 'delete') op = 'delete'
        else if (prop === 'maybeSingle' || prop === 'single') single = true
        else if (prop === 'insert') {
          db.writes.push({ table, op: 'insert', filters: [], rows: args[0] })
          return Promise.resolve({ data: null, error: null })
        }
        return proxy
      }
    },
  })
  return proxy
}
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ from: (table: string) => makeChain(table) }),
}))

import { GET, PUT } from '@/app/api/data-security/person/[personId]/route'
import { clearDataSecurityPermissionsCache } from '@/lib/data-security/permissions'

const HEAD = { person_id: 'head', login_email: 'h@test', full_name: 'Head', roles: ['teacher'], principal: 'staff' }
const NOBODY = { person_id: 'nobody', login_email: 'n@test', full_name: 'Nobody', roles: [], principal: 'staff' }

function seed() {
  db.writes = []
  db.tables = {
    departments: [
      { id: 'inst', parent_id: null, name: 'inst', name_he: null, name_en: null },
      { id: 'college', parent_id: 'inst', name: 'college', name_he: null, name_en: null },
      { id: 'stream', parent_id: 'college', name: 'stream', name_he: null, name_en: null },
      { id: 'kitchen', parent_id: 'inst', name: 'kitchen', name_he: null, name_en: null },
    ],
    staff_positions: [
      { person_id: 'head', department_id: 'college', is_head: true, end_date: null },
      { person_id: 'sec', department_id: 'stream', is_head: false, end_date: null },
      { person_id: 'cook', department_id: 'kitchen', is_head: false, end_date: null },
    ],
    persons: [
      { id: 'head', full_name: 'Head', hebrew_name: null },
      { id: 'sec', full_name: 'Sec', hebrew_name: null },
      { id: 'cook', full_name: 'Cook', hebrew_name: null },
    ],
    roles: [{ id: 'r-teacher', code: 'teacher', name: 'Teacher' }],
    person_roles: [{ person_id: 'head', role_id: 'r-teacher' }],
    role_privileges: [
      { role_id: 'r-teacher', module: 'education', privilege_code: 'view_students', scope: 'department' },
      { role_id: 'r-teacher', module: 'education', privilege_code: 'mark_attendance', scope: 'department' },
    ],
    person_privileges: [
      {
        id: 'pp-fin', person_id: 'sec', module: 'finance', privilege_code: 'view', is_granted: true,
        expires_at: null, reason: 'аудит', granted_by: 'admin',
      },
      {
        id: 'pp-vs', person_id: 'sec', module: 'education', privilege_code: 'view_students', is_granted: false,
        expires_at: null, reason: null, granted_by: 'admin',
      },
    ],
    module_privileges: [
      { module: 'education', privilege_code: 'view_students' },
      { module: 'education', privilege_code: 'mark_attendance' },
      { module: 'education', privilege_code: 'set_grades' },
      { module: 'finance', privilege_code: 'view' },
      { module: 'data_security', privilege_code: 'grant' },
    ],
  }
}

const get = (personId: string) =>
  GET(new NextRequest(`http://localhost/api/data-security/person/${personId}`), { params: { personId } })
const put = (personId: string, overrides: unknown[]) =>
  PUT(new NextRequest(`http://localhost/api/data-security/person/${personId}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ overrides }),
  }), { params: { personId } })

const ppWrites = () => db.writes.filter(w => w.table === 'person_privileges')

beforeEach(() => {
  seed()
  clearDataSecurityPermissionsCache()
  getSessionMock.mockResolvedValue(HEAD)
})

describe('GET — глава видит только свою команду', () => {
  it('человек из его ветки (единица ниже) — 200', async () => {
    expect((await get('sec')).status).toBe(200)
  })
  it('человек из соседней единицы — 403', async () => {
    expect((await get('cook')).status).toBe(403)
  })
  it('сам себя — 403 (себя в команде нет)', async () => {
    expect((await get('head')).status).toBe(403)
  })
  it('не глава и без права — 403', async () => {
    getSessionMock.mockResolvedValue(NOBODY)
    expect((await get('sec')).status).toBe(403)
  })
})

describe('PUT — только своя команда и только свои права', () => {
  it('человек вне команды — 403, записи нет', async () => {
    const res = await put('cook', [{ module: 'education', privilege_code: 'view_students', is_granted: true }])
    expect(res.status).toBe(403)
    expect(ppWrites()).toEqual([])
  })

  it('право, которого у него нет (data_security.grant) — 403, записи нет', async () => {
    const res = await put('sec', [
      { module: 'finance', privilege_code: 'view', is_granted: true },
      { module: 'data_security', privilege_code: 'grant', is_granted: true },
    ])
    expect(res.status).toBe(403)
    expect(ppWrites()).toEqual([])
  })

  it('право, которого у него нет (education.set_grades) — 403, записи нет', async () => {
    const res = await put('sec', [{ module: 'education', privilege_code: 'set_grades', is_granted: true }])
    expect(res.status).toBe(403)
    expect(ppWrites()).toEqual([])
  })

  it('снять чужую строку (finance.view) — 403, записи нет', async () => {
    const res = await put('sec', [{ module: 'finance', privilege_code: 'view', is_granted: false }])
    expect(res.status).toBe(403)
    expect(ppWrites()).toEqual([])
  })

  it('пустой список стирает только строки внутри его набора', async () => {
    const res = await put('sec', [])
    expect(res.status).toBe(200)
    const dels = ppWrites().filter(w => w.op === 'delete')
    expect(dels).toHaveLength(1)
    // Удаление строго по id строк внутри выдаваемого — не «всё по person_id».
    expect(dels[0].filters).toEqual([['in', 'id', ['pp-vs']]])
  })

  it('своё право выдаётся от имени главы, чужая строка не трогается', async () => {
    const res = await put('sec', [
      { module: 'finance', privilege_code: 'view', is_granted: true },
      { module: 'education', privilege_code: 'mark_attendance', is_granted: true },
    ])
    expect(res.status).toBe(200)
    const ins = ppWrites().filter(w => w.op === 'insert')
    expect(ins).toHaveLength(1)
    expect(ins[0].rows).toEqual([expect.objectContaining({
      person_id: 'sec', module: 'education', privilege_code: 'mark_attendance', is_granted: true, granted_by: 'head',
    })])
    const dels = ppWrites().filter(w => w.op === 'delete')
    expect(dels.every(d => JSON.stringify(d.filters) === JSON.stringify([['in', 'id', ['pp-vs']]]))).toBe(true)
  })

  it('не глава и без права — 403 (путь полного доступа), записи нет', async () => {
    getSessionMock.mockResolvedValue(NOBODY)
    const res = await put('sec', [])
    expect(res.status).toBe(403)
    expect(ppWrites()).toEqual([])
  })
})
