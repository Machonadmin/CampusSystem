import { describe, it, expect } from 'vitest'
import { planOverrideChanges, type ExistingOverride } from './person-overrides'

// Сохранение на экране «по сотруднику» раньше стирало все личные строки и
// вставляло их заново — срок, причина и «кто выдал» пропадали. Эти тесты стоят
// на том, что нетронутая строка остаётся нетронутой.

const row = (over: Partial<ExistingOverride> & { privilege_code: string }): ExistingOverride => ({
  id: `id-${over.privilege_code}`,
  module: 'finance',
  is_granted: true,
  expires_at: null,
  reason: null,
  ...over,
})

describe('planOverrideChanges', () => {
  it('нетронутые строки со сроком и причиной — ни обновления, ни удаления', () => {
    const existing = [
      row({ privilege_code: 'view', expires_at: '2026-12-31T00:00:00+00:00', reason: 'на время ревизии' }),
      row({ privilege_code: 'edit', is_granted: false }),
    ]
    const plan = planOverrideChanges(existing, [
      { module: 'finance', privilege_code: 'view', is_granted: true },
      { module: 'finance', privilege_code: 'edit', is_granted: false },
    ])
    expect(plan).toEqual({ insert: [], update: [], remove: [] })
  })

  it('новое решение вставляется, снятое — удаляется', () => {
    const plan = planOverrideChanges(
      [row({ privilege_code: 'view' }), row({ privilege_code: 'old' })],
      [
        { module: 'finance', privilege_code: 'view', is_granted: true },
        { module: 'finance', privilege_code: 'new', is_granted: false },
      ],
    )
    expect(plan.remove).toEqual(['id-old'])
    expect(plan.update).toEqual([])
    expect(plan.insert).toEqual([
      { module: 'finance', privilege_code: 'new', is_granted: false, expires_at: null, reason: null },
    ])
  })

  it('пустой список снимает все личные решения', () => {
    const plan = planOverrideChanges([row({ privilege_code: 'a' }), row({ privilege_code: 'b' })], [])
    expect(plan.remove.sort()).toEqual(['id-a', 'id-b'])
    expect(plan.insert).toEqual([])
  })

  it('перевёрнутое решение обновляется на месте, срок и причина прежнего сбрасываются', () => {
    const plan = planOverrideChanges(
      [row({ privilege_code: 'view', expires_at: '2026-12-31T00:00:00Z', reason: 'ревизия' })],
      [{ module: 'finance', privilege_code: 'view', is_granted: false }],
    )
    expect(plan.remove).toEqual([])
    expect(plan.insert).toEqual([])
    expect(plan.update).toEqual([
      { id: 'id-view', patch: { is_granted: false, expires_at: null, reason: null }, regranted: true },
    ])
  })

  it('явный expires_at: null продлевает просроченную выдачу', () => {
    const plan = planOverrideChanges(
      [row({ privilege_code: 'view', expires_at: '2020-01-01T00:00:00Z', reason: 'старое' })],
      [{ module: 'finance', privilege_code: 'view', is_granted: true, expires_at: null }],
    )
    expect(plan.update).toEqual([{ id: 'id-view', patch: { expires_at: null }, regranted: true }])
  })

  it('тот же момент в другом формате правкой не считается', () => {
    const plan = planOverrideChanges(
      [row({ privilege_code: 'view', expires_at: '2026-12-31T00:00:00+00:00' })],
      [{ module: 'finance', privilege_code: 'view', is_granted: true, expires_at: '2026-12-31T00:00:00.000Z' }],
    )
    expect(plan.update).toEqual([])
  })

  it('правка одной причины не меняет «кто выдал»', () => {
    const plan = planOverrideChanges(
      [row({ privilege_code: 'view', reason: 'a' })],
      [{ module: 'finance', privilege_code: 'view', is_granted: true, reason: '  b ' }],
    )
    expect(plan.update).toEqual([{ id: 'id-view', patch: { reason: 'b' }, regranted: false }])
  })

  it('одно право в разных модулях — разные строки', () => {
    const plan = planOverrideChanges(
      [row({ module: 'finance', privilege_code: 'view' })],
      [
        { module: 'finance', privilege_code: 'view', is_granted: true },
        { module: 'education', privilege_code: 'view', is_granted: true },
      ],
    )
    expect(plan.remove).toEqual([])
    expect(plan.insert.map(i => i.module)).toEqual(['education'])
  })
})
