import { describe, it, expect } from 'vitest'
import { CLOSED_TASK_STATUSES_FILTER, EMPTY_OPEN_ITEMS, countOpenItems, isOpenForPanel } from './open-items'

describe('open-items helpers', () => {
  it('фильтр закрытых статусов — в формате PostgREST in', () => {
    expect(CLOSED_TASK_STATUSES_FILTER).toBe('("completed","cancelled","declined")')
  })
  it('isOpenForPanel', () => {
    expect(isOpenForPanel('pending')).toBe(true)
    expect(isOpenForPanel('in_progress')).toBe(true)
    expect(isOpenForPanel('unassigned')).toBe(true)
    expect(isOpenForPanel('review')).toBe(true)
    expect(isOpenForPanel('completed')).toBe(false)
    expect(isOpenForPanel('cancelled')).toBe(false)
    expect(isOpenForPanel('declined')).toBe(false)
  })
  it('countOpenItems суммирует три раздела и терпит пустое', () => {
    expect(countOpenItems(null)).toBe(0)
    expect(countOpenItems(EMPTY_OPEN_ITEMS)).toBe(0)
    expect(countOpenItems({
      alerts: [{} as never, {} as never],
      absence_cases: [{} as never],
      tasks: [{} as never, {} as never, {} as never],
    })).toBe(6)
  })
})
