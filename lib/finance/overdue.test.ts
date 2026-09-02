import { describe, it, expect } from 'vitest'
import { isJourneyOverdue } from './overdue'

const TODAY = '2026-09-02'

describe('isJourneyOverdue', () => {
  it('is false when the balance is zero or negative', () => {
    expect(isJourneyOverdue(0, [{ due_date: '2020-01-01', status: 'active' }], TODAY)).toBe(false)
    expect(isJourneyOverdue(-100, [{ due_date: '2020-01-01', status: 'active' }], TODAY)).toBe(false)
  })
  it('is true when there is a debt and a past-due active charge', () => {
    expect(isJourneyOverdue(1000, [{ due_date: '2026-08-01', status: 'active' }], TODAY)).toBe(true)
  })
  it('is false when the only past-due charge is cancelled', () => {
    expect(isJourneyOverdue(1000, [{ due_date: '2026-08-01', status: 'cancelled' }], TODAY)).toBe(false)
  })
  it('is false when charges are due in the future or have no due date', () => {
    expect(isJourneyOverdue(1000, [{ due_date: '2027-01-01', status: 'active' }], TODAY)).toBe(false)
    expect(isJourneyOverdue(1000, [{ due_date: null, status: 'active' }], TODAY)).toBe(false)
  })
  it('is true if any active charge is overdue among several', () => {
    expect(isJourneyOverdue(1000, [
      { due_date: '2027-01-01', status: 'active' },
      { due_date: '2026-01-01', status: 'active' },
    ], TODAY)).toBe(true)
  })
})
