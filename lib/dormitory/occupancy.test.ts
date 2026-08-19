import { describe, it, expect } from 'vitest'
import {
  isActiveOn,
  rangesOverlap,
  occupancy,
  canAssign,
  type Assignment,
} from './occupancy'

const A = (from: string, to: string | null, status = 'active'): Assignment => ({
  assigned_from: from,
  assigned_to: to,
  status,
})

describe('isActiveOn', () => {
  it('is active on a date inside a closed range', () => {
    expect(isActiveOn(A('2026-01-01', '2026-12-31'), '2026-06-15')).toBe(true)
  })
  it('is active on the boundary dates (inclusive)', () => {
    expect(isActiveOn(A('2026-01-01', '2026-12-31'), '2026-01-01')).toBe(true)
    expect(isActiveOn(A('2026-01-01', '2026-12-31'), '2026-12-31')).toBe(true)
  })
  it('is active for an open-ended assignment on/after the start', () => {
    expect(isActiveOn(A('2026-01-01', null), '2026-01-01')).toBe(true)
    expect(isActiveOn(A('2026-01-01', null), '2030-01-01')).toBe(true)
  })
  it('is not active before the start', () => {
    expect(isActiveOn(A('2026-02-01', null), '2026-01-31')).toBe(false)
  })
  it('is not active after the end', () => {
    expect(isActiveOn(A('2026-01-01', '2026-06-30'), '2026-07-01')).toBe(false)
  })
  it('ignores ended assignments even inside the range', () => {
    expect(isActiveOn(A('2026-01-01', '2026-12-31', 'ended'), '2026-06-15')).toBe(false)
  })
})

describe('rangesOverlap', () => {
  it('detects overlapping closed ranges', () => {
    expect(rangesOverlap('2026-01-01', '2026-06-30', '2026-06-01', '2026-12-31')).toBe(true)
  })
  it('treats a shared boundary day as overlap (inclusive)', () => {
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

describe('occupancy', () => {
  it('counts only active-on-date assignments', () => {
    const rows = [
      A('2026-01-01', '2026-12-31'),        // active
      A('2026-01-01', null),                // active open-ended
      A('2026-01-01', '2026-03-31'),        // ended by date
      A('2026-01-01', '2026-12-31', 'ended'), // status ended
    ]
    expect(occupancy(rows, 3, '2026-06-15')).toEqual({
      capacity: 3, occupied: 2, free: 1, isFull: false,
    })
  })
  it('is full exactly at capacity', () => {
    const rows = [A('2026-01-01', null), A('2026-01-01', null)]
    expect(occupancy(rows, 2, '2026-06-15')).toEqual({
      capacity: 2, occupied: 2, free: 0, isFull: true,
    })
  })
  it('reports free = 0 (never negative) when over capacity', () => {
    const rows = [A('2026-01-01', null), A('2026-01-01', null), A('2026-01-01', null)]
    expect(occupancy(rows, 2, '2026-06-15')).toEqual({
      capacity: 2, occupied: 3, free: 0, isFull: true,
    })
  })
  it('empty room', () => {
    expect(occupancy([], 4, '2026-06-15')).toEqual({
      capacity: 4, occupied: 0, free: 4, isFull: false,
    })
  })
})

describe('canAssign', () => {
  it('allows when room has free capacity and no student clash', () => {
    expect(canAssign({ roomCapacity: 2, existingActiveOverlapping: 1, studentHasActiveOverlap: false }))
      .toEqual({ ok: true })
  })
  it('rejects room_full when overlapping active >= capacity', () => {
    expect(canAssign({ roomCapacity: 2, existingActiveOverlapping: 2, studentHasActiveOverlap: false }))
      .toEqual({ ok: false, reason: 'room_full' })
  })
  it('rejects student_double_booked even if the room has space', () => {
    expect(canAssign({ roomCapacity: 4, existingActiveOverlapping: 1, studentHasActiveOverlap: true }))
      .toEqual({ ok: false, reason: 'student_double_booked' })
  })
  it('room_full takes precedence over student double-booking', () => {
    expect(canAssign({ roomCapacity: 1, existingActiveOverlapping: 1, studentHasActiveOverlap: true }))
      .toEqual({ ok: false, reason: 'room_full' })
  })
})
