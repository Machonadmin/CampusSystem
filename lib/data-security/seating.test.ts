import { describe, it, expect } from 'vitest'
import { personSeats, withSeat, withoutSeat, toSeatPayload } from './seating'
import type { UnitNode } from './units'

// Маршрут посадки заменяет набор единиц ЦЕЛИКОМ. Значит любая правка с экрана
// дерева обязана пересобрать полный набор, а не прислать одну единицу. Эти
// тесты стоят ровно на этом: потерянная единица = человек выселен оттуда,
// где его никто не трогал.

const node = (id: string, seats: UnitNode['seats'], children: UnitNode[] = []): UnitNode => ({
  id, parentId: null, name: id, isEducational: false, headPersonId: null,
  seatCount: seats.length, seats, seatCountDeep: seats.length, children,
})

const tree: UnitNode[] = [
  node('inst', [{ personId: 'p1', isHead: false }], [
    node('kodesh', [{ personId: 'p1', isHead: true }, { personId: 'p2', isHead: false }]),
    node('dorm', []),
  ]),
]

describe('personSeats', () => {
  it('собирает единицы человека по всему дереву, включая вложенные', () => {
    expect(personSeats(tree, 'p1')).toEqual([
      { departmentId: 'inst', isHead: false },
      { departmentId: 'kodesh', isHead: true },
    ])
  })

  it('человек без посадок — пустой набор, а не ошибка', () => {
    expect(personSeats(tree, 'nobody')).toEqual([])
  })
})

describe('withSeat', () => {
  it('добавляет единицу, СОХРАНЯЯ прежние', () => {
    const next = withSeat(personSeats(tree, 'p1'), 'dorm', false)
    expect(next.map(s => s.departmentId).sort()).toEqual(['dorm', 'inst', 'kodesh'])
  })

  it('повторное добавление не плодит дубль, а правит признак главы', () => {
    const next = withSeat(personSeats(tree, 'p1'), 'kodesh', false)
    expect(next.filter(s => s.departmentId === 'kodesh')).toEqual([
      { departmentId: 'kodesh', isHead: false },
    ])
  })

  it('назначение главой не трогает остальные единицы', () => {
    const next = withSeat(personSeats(tree, 'p1'), 'inst', true)
    expect(next).toEqual([
      { departmentId: 'inst', isHead: true },
      { departmentId: 'kodesh', isHead: true },
    ])
  })
})

describe('withoutSeat', () => {
  it('снимает только названную единицу', () => {
    expect(withoutSeat(personSeats(tree, 'p1'), 'kodesh')).toEqual([
      { departmentId: 'inst', isHead: false },
    ])
  })

  it('снятие последней даёт пустой набор — это допустимо', () => {
    expect(withoutSeat(personSeats(tree, 'p2'), 'kodesh')).toEqual([])
  })

  it('снятие того, чего нет, ничего не меняет', () => {
    const before = personSeats(tree, 'p1')
    expect(withoutSeat(before, 'dorm')).toEqual(before)
  })
})

describe('toSeatPayload', () => {
  it('отдаёт тело в формате маршрута', () => {
    expect(toSeatPayload([{ departmentId: 'd1', isHead: true }])).toEqual({
      units: [{ department_id: 'd1', is_head: true }],
    })
  })
})
