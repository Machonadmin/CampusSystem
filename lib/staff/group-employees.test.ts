import { describe, it, expect } from 'vitest'
import { groupSeatsByPerson } from './group-employees'

const seat = (person_id: string, position: string) => ({ person_id, position })

describe('groupSeatsByPerson', () => {
  it('человек с несколькими должностями — одна строка со всеми посадками', () => {
    const out = groupSeatsByPerson([
      seat('a', 'ראש מחלקה'), seat('b', 'מורה'), seat('a', 'קבוצה א׳'), seat('a', 'קבוצה ב׳'),
    ])
    expect(out).toHaveLength(2)
    expect(out[0].person.person_id).toBe('a')
    expect(out[0].seats.map(s => s.position)).toEqual(['ראש מחלקה', 'קבוצה א׳', 'קבוצה ב׳'])
    expect(out[1].seats.map(s => s.position)).toEqual(['מורה'])
  })

  it('порядок людей — как пришёл (по имени из API)', () => {
    const out = groupSeatsByPerson([seat('x', '1'), seat('y', '1'), seat('x', '2')])
    expect(out.map(g => g.person.person_id)).toEqual(['x', 'y'])
  })

  it('пусто → пусто', () => {
    expect(groupSeatsByPerson([])).toEqual([])
  })
})
