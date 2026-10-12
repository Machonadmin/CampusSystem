import { describe, it, expect } from 'vitest'
import { isTaskView, mergeTaskLists } from './views'

const row = (id: string, created_at: string) => ({ id, created_at })

describe('isTaskView', () => {
  it('знает «все» и четыре источника, остальное — нет', () => {
    for (const v of ['all', 'assigned', 'created', 'department', 'watching']) expect(isTaskView(v)).toBe(true)
    expect(isTaskView('mine')).toBe(false)
    expect(isTaskView(null)).toBe(false)
  })
})

describe('mergeTaskLists', () => {
  it('задача из нескольких источников остаётся одна', () => {
    const t1 = row('a', '2026-10-01T10:00:00+00:00')
    const out = mergeTaskLists([[t1], [t1, row('b', '2026-10-02T10:00:00+00:00')], [t1]])
    expect(out.map(r => r.id)).toEqual(['b', 'a'])
  })

  it('новые сверху, при одинаковом времени — по id', () => {
    const out = mergeTaskLists([
      [row('c', '2026-10-01T10:00:00+00:00'), row('a', '2026-10-03T10:00:00.5+00:00')],
      [row('b', '2026-10-01T10:00:00+00:00'), row('d', '2026-10-03T10:00:00+00:00')],
    ])
    expect(out.map(r => r.id)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('пустые источники — пустой список', () => {
    expect(mergeTaskLists([[], []])).toEqual([])
  })
})
