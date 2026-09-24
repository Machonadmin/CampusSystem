import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Ограниченная «אבטחת מידע» главы отдела ──────────────────────────────────
//
// Три обещания, которые здесь проверяются:
//   1. глава видит только свою команду (действующие посадки в его ветке, без него);
//   2. выдать он может только то, что есть у него самого, кроме прав
//      data_security и 'delegate_privileges';
//   3. сохранение не может стереть или изменить строки вне его набора.

/** Запись вызовов к Supabase для проверки saveHeadOverrides. */
const calls: { table: string; op: string; arg?: unknown }[] = []
let tableData: Record<string, unknown[]> = {}

function makeClient() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      const result = () => Promise.resolve({ data: tableData[table] ?? [], error: null })
      for (const m of ['select', 'eq', 'in', 'is', 'order']) {
        chain[m] = (...args: unknown[]) => {
          if (m === 'in' && calls.length && calls[calls.length - 1].table === table && calls[calls.length - 1].op === 'delete') {
            calls[calls.length - 1].arg = args
          }
          return chain
        }
      }
      chain.delete = () => { calls.push({ table, op: 'delete' }); return chain }
      chain.insert = (rows: unknown) => { calls.push({ table, op: 'insert', arg: rows }); return result() }
      chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => result().then(res, rej)
      return chain
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => makeClient() }))

import {
  computeTeam, grantableFrom, mergeHeadOverrides, pruneTreeToGrantable, pruneUnitsToHeaded,
  saveHeadOverrides, type ExistingOverride, type HeadScope,
} from './head-scope'
import type { ResolvedPrivilege } from './person'
import type { BuiltTree, CatalogEntry, TreeNode } from './tree'
import type { UnitNode } from './units'
import type { SessionPayload } from '@/lib/auth/jwt'

const TODAY = '2026-09-24'

// Институт → Колледж → (Поток А, Поток Б); рядом — Кухня.
const DEPTS = [
  { id: 'inst', parent_id: null },
  { id: 'college', parent_id: 'inst' },
  { id: 'streamA', parent_id: 'college' },
  { id: 'streamB', parent_id: 'college' },
  { id: 'kitchen', parent_id: 'inst' },
]

describe('computeTeam — «его команда»', () => {
  const seats = [
    { person_id: 'head', department_id: 'college', end_date: null },
    { person_id: 'sec', department_id: 'college', end_date: null },
    { person_id: 'teacherA', department_id: 'streamA', end_date: null },
    { person_id: 'teacherB', department_id: 'streamB', end_date: '2027-01-01' },
    { person_id: 'left', department_id: 'streamA', end_date: '2026-09-01' },
    { person_id: 'endsToday', department_id: 'streamA', end_date: TODAY },
    { person_id: 'cook', department_id: 'kitchen', end_date: null },
    { person_id: 'boss', department_id: 'inst', end_date: null },
    { person_id: 'nodept', department_id: null, end_date: null },
  ]

  it('своя единица и всё ниже, только действующие посадки, без себя', () => {
    const team = computeTeam(['college'], DEPTS, seats, TODAY, 'head')
    expect([...team].sort()).toEqual(['sec', 'teacherA', 'teacherB'])
  })

  it('соседние и вышестоящие единицы в команду не попадают', () => {
    const team = computeTeam(['college'], DEPTS, seats, TODAY, 'head')
    expect(team.has('cook')).toBe(false)
    expect(team.has('boss')).toBe(false)
    expect(team.has('left')).toBe(false)
    expect(team.has('endsToday')).toBe(false)
    expect(team.has('head')).toBe(false)
  })

  it('не глава — пустая команда', () => {
    expect(computeTeam([], DEPTS, seats, TODAY, 'head').size).toBe(0)
  })

  it('цикл в структуре не зацикливает расчёт', () => {
    const cyclic = [{ id: 'a', parent_id: 'b' }, { id: 'b', parent_id: 'a' }]
    const team = computeTeam(['a'], cyclic, [{ person_id: 'x', department_id: 'b', end_date: null }], TODAY, 'head')
    expect([...team]).toEqual(['x'])
  })
})

const rp = (module: string, code: string, extra: Partial<ResolvedPrivilege> = {}): ResolvedPrivilege => ({
  module, code, granted: true, source: 'role', scope: 'all', expiresAt: null, expired: false, ...extra,
})

describe('grantableFrom — «то, что утверждено ему самому»', () => {
  it('только действующие права, без data_security и delegate_privileges', () => {
    const g = grantableFrom([
      rp('education', 'view_students'),
      rp('education', 'mark_attendance', { source: 'personal_grant' }),
      rp('education', 'set_grades', { granted: false, source: 'personal_deny', scope: null }),
      rp('education', 'manage_students', { granted: false, source: 'personal_grant', scope: null, expired: true }),
      rp('education', 'delegate_privileges', { source: 'personal_grant' }),
      rp('data_security', 'grant'),
      rp('data_security', 'access'),
      rp('finance', 'view'),
    ])
    expect([...g].sort()).toEqual(['education::mark_attendance', 'education::view_students', 'finance::view'])
  })
})

const ex = (module: string, code: string, is_granted: boolean, extra: Partial<ExistingOverride> = {}): ExistingOverride => ({
  id: `${module}.${code}`, module, privilege_code: code, is_granted,
  expires_at: null, reason: null, granted_by: 'admin', ...extra,
})

describe('mergeHeadOverrides — сохранение главой', () => {
  const grantable = new Set(['education::view_students', 'education::mark_attendance'])
  const existing = [
    ex('education', 'view_students', true, { granted_by: 'admin' }),
    ex('finance', 'view', true, { expires_at: '2027-01-01T00:00:00Z', reason: 'аудит', granted_by: 'admin' }),
    ex('education', 'set_grades', false, { reason: 'запрет' }),
    ex('hr', 'view', true, { expires_at: '2026-01-01T00:00:00Z' }), // просроченная
  ]

  it('итог = чужие строки как в БД + присланные внутри выдаваемого', () => {
    const r = mergeHeadOverrides(existing, [
      // экран присылает полный список, в том числе чужие — без изменений
      { module: 'finance', privilege_code: 'view', is_granted: true },
      { module: 'education', privilege_code: 'set_grades', is_granted: false },
      // своё: снял view_students, выдал mark_attendance
      { module: 'education', privilege_code: 'mark_attendance', is_granted: true },
    ], grantable, 'head')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.deleteIds).toEqual(['education.view_students'])
    expect(r.insert).toEqual([{
      module: 'education', privilege_code: 'mark_attendance', is_granted: true,
      expires_at: null, reason: null, granted_by: 'head',
    }])
    // Чужие строки — ровно как в БД: срок, причина, кто выдал; просроченная тоже.
    expect(r.kept.map(k => k.id).sort()).toEqual(['education.set_grades', 'finance.view', 'hr.view'])
    const fin = r.final.find(f => f.module === 'finance')!
    expect(fin).toEqual({
      module: 'finance', privilege_code: 'view', is_granted: true,
      expires_at: '2027-01-01T00:00:00Z', reason: 'аудит', granted_by: 'admin',
    })
    expect(r.final.some(f => f.privilege_code === 'view_students')).toBe(false)
  })

  it('пустой список не стирает чужие строки', () => {
    const r = mergeHeadOverrides(existing, [], grantable, 'head')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.kept).toHaveLength(3)
    expect(r.deleteIds).toEqual(['education.view_students'])
    expect(r.insert).toEqual([])
  })

  it('выдать право, которого у него нет, — отказ', () => {
    const r = mergeHeadOverrides(existing, [
      { module: 'data_security', privilege_code: 'grant', is_granted: true },
    ], grantable, 'head')
    expect(r).toEqual({ ok: false, key: 'data_security::grant' })
  })

  it('перевернуть чужую строку — отказ', () => {
    expect(mergeHeadOverrides(existing, [
      { module: 'education', privilege_code: 'set_grades', is_granted: true },
    ], grantable, 'head').ok).toBe(false)
    expect(mergeHeadOverrides(existing, [
      { module: 'finance', privilege_code: 'view', is_granted: false },
    ], grantable, 'head').ok).toBe(false)
  })

  it('поменять срок или причину чужой строки — отказ', () => {
    expect(mergeHeadOverrides(existing, [
      { module: 'finance', privilege_code: 'view', is_granted: true, expires_at: null },
    ], grantable, 'head').ok).toBe(false)
    expect(mergeHeadOverrides(existing, [
      { module: 'finance', privilege_code: 'view', is_granted: true, reason: 'другая' },
    ], grantable, 'head').ok).toBe(false)
  })

  it('повтор ключа внутри выдаваемого — побеждает последняя строка', () => {
    const r = mergeHeadOverrides([], [
      { module: 'education', privilege_code: 'view_students', is_granted: true },
      { module: 'education', privilege_code: 'view_students', is_granted: false },
    ], grantable, 'head')
    expect(r.ok && r.insert).toEqual([expect.objectContaining({ privilege_code: 'view_students', is_granted: false })])
  })
})

const entry = (module: string, code: string): CatalogEntry => ({
  module, code, name: code, description: null, level: null, risk: 'normal',
  allowedScopes: [], isLegacy: false, supersededBy: null,
})
const node = (id: string, items: CatalogEntry[], children: TreeNode[] = []): TreeNode => ({
  id, parentId: null, sortOrder: 0, name: id, description: null, moduleCode: null,
  icon: null, color: null, departmentId: null, children, items,
  texts: { name_he: id, name_ru: id, name_en: '', description_he: '', description_ru: '', description_en: '' },
})

describe('pruneTreeToGrantable', () => {
  it('оставляет только выдаваемые права и выбрасывает пустые узлы', () => {
    const tree: BuiltTree = {
      roots: [
        node('edu', [entry('education', 'view_students'), entry('education', 'set_grades')], [
          node('edu-sub', [entry('education', 'delegate_privileges')]),
        ]),
        node('sec', [entry('data_security', 'grant')]),
      ],
      unassigned: [entry('finance', 'view'), entry('hr', 'view')],
    }
    const out = pruneTreeToGrantable(tree, new Set(['education::view_students', 'finance::view']))
    expect(out.roots.map(r => r.id)).toEqual(['edu'])
    expect(out.roots[0].items.map(i => i.code)).toEqual(['view_students'])
    expect(out.roots[0].children).toEqual([])
    expect(out.unassigned.map(i => i.code)).toEqual(['view'])
  })
})

describe('pruneUnitsToHeaded', () => {
  const u = (id: string, children: UnitNode[] = []): UnitNode => ({
    id, parentId: null, name: id, isEducational: false, seatCount: 0, seats: [], seatCountDeep: 0,
    names: { he: id, ru: id, en: '' }, children,
  })
  it('корнями становятся возглавляемые единицы, остальное скрыто', () => {
    const roots = [u('inst', [u('college', [u('streamA')]), u('kitchen')])]
    const out = pruneUnitsToHeaded(roots, ['college'])
    expect(out.map(r => r.id)).toEqual(['college'])
    expect(out[0].children.map(c => c.id)).toEqual(['streamA'])
  })
})

describe('saveHeadOverrides — что уходит в БД', () => {
  const session = { person_id: 'head', roles: [], principal: 'staff' } as unknown as SessionPayload
  const scope: HeadScope = {
    headedUnitIds: ['college'],
    personIds: new Set(['sec']),
    grantable: new Set(['education::view_students']),
  }

  beforeEach(() => {
    calls.length = 0
    tableData = {
      person_privileges: [
        ex('education', 'view_students', false),
        ex('finance', 'view', true, { reason: 'аудит' }),
      ],
      module_privileges: [
        { module: 'education', privilege_code: 'view_students' },
        { module: 'finance', privilege_code: 'view' },
      ],
    }
  })

  it('человек вне команды — отказ, в БД ничего не пишется', async () => {
    const r = await saveHeadOverrides({ session, scope }, 'outsider', [
      { module: 'education', privilege_code: 'view_students', is_granted: true },
    ])
    expect(r).toBe('forbidden')
    expect(calls).toEqual([])
  })

  it('чужое право — отказ, в БД ничего не пишется', async () => {
    const r = await saveHeadOverrides({ session, scope }, 'sec', [
      { module: 'finance', privilege_code: 'view', is_granted: false },
    ])
    expect(r).toBe('forbidden')
    expect(calls).toEqual([])
  })

  it('удаляются только строки внутри выдаваемого, по id', async () => {
    const r = await saveHeadOverrides({ session, scope }, 'sec', [
      { module: 'education', privilege_code: 'view_students', is_granted: true },
      { module: 'finance', privilege_code: 'view', is_granted: true },
    ])
    expect(r).toBe('ok')
    const del = calls.find(c => c.op === 'delete')!
    expect(del.arg).toEqual(['id', ['education.view_students']])
    const ins = calls.find(c => c.op === 'insert')!
    expect(ins.arg).toEqual([expect.objectContaining({
      person_id: 'sec', module: 'education', privilege_code: 'view_students', is_granted: true, granted_by: 'head',
    })])
  })
})
