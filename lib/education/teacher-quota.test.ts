import { describe, it, expect } from 'vitest'
import { sumAssignedHoursByTeacher, computeRemaining, isOverQuota } from './teacher-quota'

describe('sumAssignedHoursByTeacher', () => {
  it('sums course hours per teacher across courses', () => {
    const m = sumAssignedHoursByTeacher([
      { teacherIds: ['t1', 't2'], hours: 4 },
      { teacherIds: ['t1'], hours: 6 },
      { teacherIds: ['t3'], hours: 2 },
    ])
    expect(m.get('t1')).toBe(10)
    expect(m.get('t2')).toBe(4)
    expect(m.get('t3')).toBe(2)
  })
  it('ignores courses with null/zero hours and courses with no teachers', () => {
    const m = sumAssignedHoursByTeacher([
      { teacherIds: ['t1'], hours: null },
      { teacherIds: ['t1'], hours: 0 },
      { teacherIds: [], hours: 5 },
      { teacherIds: ['t1'], hours: 3 },
    ])
    expect(m.get('t1')).toBe(3)
  })
  it('returns an empty map for no courses', () => {
    expect(sumAssignedHoursByTeacher([]).size).toBe(0)
  })
})

describe('computeRemaining', () => {
  it('is approved minus assigned', () => {
    expect(computeRemaining(20, 12)).toBe(8)
    expect(computeRemaining(10, 14)).toBe(-4)
  })
})

describe('isOverQuota (warn-only, §6.1)', () => {
  it('is true only when assigned exceeds approved', () => {
    expect(isOverQuota(10, 12)).toBe(true)
    expect(isOverQuota(10, 10)).toBe(false)
    expect(isOverQuota(10, 8)).toBe(false)
  })
  it('is false when no quota is set', () => {
    expect(isOverQuota(null, 100)).toBe(false)
    expect(isOverQuota(undefined, 100)).toBe(false)
  })
})
