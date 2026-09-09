import { describe, it, expect } from 'vitest'
import {
  MAINTENANCE_ROLE_CODES,
  MAINTENANCE_METADATA_FILTER,
  isMaintenanceTask,
  withMaintenanceFlag,
  canBeMaintenanceTask,
} from './maintenance-link'

// Флаг «это задача по эксплуатации» хранится в tasks.metadata и читается двумя
// путями: в БД через jsonb `@>` (точное сравнение) и в коде через
// isMaintenanceTask. Эти пути обязаны совпадать — отсюда строгая проверка на
// === true и удаление ключа при снятии флага.

describe('isMaintenanceTask', () => {
  it('только строгое true считается флагом', () => {
    expect(isMaintenanceTask({ maintenance: true })).toBe(true)
  })
  it('«почти истинные» значения не считаются (иначе БД и код разойдутся)', () => {
    expect(isMaintenanceTask({ maintenance: 'true' })).toBe(false)
    expect(isMaintenanceTask({ maintenance: 1 })).toBe(false)
    expect(isMaintenanceTask({ maintenance: false })).toBe(false)
  })
  it('пустая / отсутствующая / чужая metadata — не флаг', () => {
    expect(isMaintenanceTask({})).toBe(false)
    expect(isMaintenanceTask(null)).toBe(false)
    expect(isMaintenanceTask(undefined)).toBe(false)
    expect(isMaintenanceTask({ source: 'acceptance' })).toBe(false)
  })
  it('не объект (строка, число, массив) — не флаг и не падает', () => {
    expect(isMaintenanceTask('maintenance')).toBe(false)
    expect(isMaintenanceTask(7)).toBe(false)
    expect(isMaintenanceTask([{ maintenance: true }])).toBe(false)
  })
})

describe('withMaintenanceFlag', () => {
  it('ставит флаг, не трогая остальные ключи', () => {
    expect(withMaintenanceFlag({ source: 'acceptance' }, true))
      .toEqual({ source: 'acceptance', maintenance: true })
  })
  it('снимает флаг УДАЛЕНИЕМ ключа, а не значением false', () => {
    const off = withMaintenanceFlag({ maintenance: true, source: 'x' }, false)
    expect(off).toEqual({ source: 'x' })
    expect('maintenance' in off).toBe(false)
  })
  it('не мутирует исходный объект', () => {
    const original = { maintenance: true }
    withMaintenanceFlag(original, false)
    expect(original).toEqual({ maintenance: true })
  })
  it('null/undefined/не-объект превращаются в чистый объект', () => {
    expect(withMaintenanceFlag(null, true)).toEqual({ maintenance: true })
    expect(withMaintenanceFlag(undefined, false)).toEqual({})
    expect(withMaintenanceFlag('junk', true)).toEqual({ maintenance: true })
  })
  it('результат withMaintenanceFlag(x, true) всегда читается как флаг', () => {
    for (const m of [null, {}, { a: 1 }, { maintenance: false }]) {
      expect(isMaintenanceTask(withMaintenanceFlag(m, true))).toBe(true)
    }
  })
  it('фильтр для БД совпадает с тем, что пишет withMaintenanceFlag', () => {
    expect(withMaintenanceFlag({}, true)).toMatchObject(MAINTENANCE_METADATA_FILTER)
  })
})

describe('canBeMaintenanceTask', () => {
  const staff = new Set(['p-maint'])

  it('персональное назначение на человека из техслужбы — можно', () => {
    expect(canBeMaintenanceTask('person', 'p-maint', staff)).toBe(true)
  })
  it('человек не из техслужбы — нельзя (задача секретаря не уходит в эксплуатацию)', () => {
    expect(canBeMaintenanceTask('person', 'p-secretary', staff)).toBe(false)
  })
  it('пул отдела/должности и «не назначено» — нельзя, нет конкретного исполнителя', () => {
    expect(canBeMaintenanceTask('department', null, staff)).toBe(false)
    expect(canBeMaintenanceTask('position', 'p-maint', staff)).toBe(false)
    expect(canBeMaintenanceTask('unassigned', null, staff)).toBe(false)
  })
  it('fail-closed: нет исполнителя, пустой список техслужбы, мусор на входе', () => {
    expect(canBeMaintenanceTask('person', null, staff)).toBe(false)
    expect(canBeMaintenanceTask('person', undefined, staff)).toBe(false)
    expect(canBeMaintenanceTask('person', 'p-maint', new Set())).toBe(false)
    expect(canBeMaintenanceTask(null, 'p-maint', staff)).toBe(false)
    expect(canBeMaintenanceTask('', '', staff)).toBe(false)
  })
})

describe('MAINTENANCE_ROLE_CODES', () => {
  it('обе роли техслужбы — и руководитель, и сотрудник (решение владельца: «שניהם»)', () => {
    expect([...MAINTENANCE_ROLE_CODES].sort()).toEqual(['maintenance_head', 'maintenance_staff'])
  })
})
