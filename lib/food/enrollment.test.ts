import { describe, it, expect } from 'vitest'
import {
  isActiveOn,
  rangesOverlap,
  activeCount,
  canEnroll,
  type Enrollment,
} from './enrollment'

const E = (from: string, to: string | null, status = 'active'): Enrollment => ({
  enrolled_from: from,
  enrolled_to: to,
  status,
})

describe('isActiveOn', () => {
  it('is active on a date inside a closed range', () => {
    expect(isActiveOn(E('2026-01-01', '2026-12-31'), '2026-06-15')).toBe(true)
  })
  it('is active on the boundary dates (inclusive)', () => {
    expect(isActiveOn(E('2026-01-01', '2026-12-31'), '2026-01-01')).toBe(true)
    expect(isActiveOn(E('2026-01-01', '2026-12-31'), '2026-12-31')).toBe(true)
  })
  it('is active for an open-ended enrollment on/after the start', () => {
    expect(isActiveOn(E('2026-01-01', null), '2026-01-01')).toBe(true)
    expect(isActiveOn(E('2026-01-01', null), '2030-01-01')).toBe(true)
  })
  it('is not active before the start', () => {
    expect(isActiveOn(E('2026-02-01', null), '2026-01-31')).toBe(false)
  })
  it('is not active after the end', () => {
    expect(isActiveOn(E('2026-01-01', '2026-06-30'), '2026-07-01')).toBe(false)
  })
  it('ignores ended enrollments even inside the range', () => {
    expect(isActiveOn(E('2026-01-01', '2026-12-31', 'ended'), '2026-06-15')).toBe(false)
  })
})

describe('rangesOverlap', () => {
  it('detects overlapping closed ranges', () => {
    expect(rangesOverlap('2026-01-01', '2026-06-30', '2026-06-01', '2026-12-31')).toBe(true)
  })
  it('treats a shared boundary day as overlap (inclusive, exactly touching)', () => {
    expect(rangesOverlap('2026-01-01', '2026-06-30', '2026-06-30', '2026-12-31')).toBe(true)
  })
  it('adjacent non-overlapping ranges do not overlap', () => {
    expect(rangesOverlap('2026-01-01', '2026-06-29', '2026-06-30', '2026-12-31')).toBe(false)
  })
  it('open-ended range overlaps anything at/after its start', () => {
    expect(rangesOverlap('2026-01-01', null, '2030-01-01', '2030-12-31')).toBe(true)
  })
  it('two open-ended ranges always overlap', () => {
    expect(rangesOverlap('2026-01-01', null, '2020-01-01', null)).toBe(true)
  })
  it('disjoint closed ranges (b before a) do not overlap', () => {
    expect(rangesOverlap('2026-06-01', '2026-12-31', '2026-01-01', '2026-05-31')).toBe(false)
  })
})

describe('activeCount', () => {
  it('counts only active-on-date enrollments', () => {
    const rows = [
      E('2026-01-01', '2026-12-31'),          // active
      E('2026-01-01', null),                  // active open-ended
      E('2026-01-01', '2026-03-31'),          // ended by date
      E('2026-01-01', '2026-12-31', 'ended'), // status ended
    ]
    expect(activeCount(rows, '2026-06-15')).toBe(2)
  })
  it('is 0 for an empty list', () => {
    expect(activeCount([], '2026-06-15')).toBe(0)
  })
})

describe('canEnroll', () => {
  it('allows when the student has no overlapping active enrollment', () => {
    expect(canEnroll({ studentHasActiveOverlap: false })).toEqual({ ok: true })
  })
  it('rejects student_double_enrolled on an overlapping active enrollment', () => {
    expect(canEnroll({ studentHasActiveOverlap: true }))
      .toEqual({ ok: false, reason: 'student_double_enrolled' })
  })
})
