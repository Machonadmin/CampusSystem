import { describe, it, expect } from 'vitest'
import {
  visibleSections,
  pickCurrentActive,
  flattenPhones,
  hasAllergies,
  type OverviewPerms,
} from './overview'

const PERMS = (over: Partial<OverviewPerms> = {}): OverviewPerms => ({
  finance: false,
  dormitory: false,
  food: false,
  doctor: false,
  psychologist: false,
  ...over,
})

describe('visibleSections', () => {
  it('returns an empty list when the viewer has no module privileges', () => {
    expect(visibleSections(PERMS())).toEqual([])
  })

  it('returns all five sections in canonical order when everything is granted', () => {
    expect(
      visibleSections(PERMS({ finance: true, dormitory: true, food: true, doctor: true, psychologist: true })),
    ).toEqual(['finance', 'dormitory', 'food', 'medical', 'counseling'])
  })

  it('maps doctor → medical and psychologist → counseling', () => {
    expect(visibleSections(PERMS({ doctor: true }))).toEqual(['medical'])
    expect(visibleSections(PERMS({ psychologist: true }))).toEqual(['counseling'])
  })

  it('includes only the granted sections and keeps their fixed order', () => {
    expect(visibleSections(PERMS({ food: true, finance: true }))).toEqual(['finance', 'food'])
    expect(visibleSections(PERMS({ psychologist: true, dormitory: true }))).toEqual(['dormitory', 'counseling'])
  })
})

describe('pickCurrentActive', () => {
  interface Row { from: string; active: boolean }
  const isActive = (r: Row) => r.active
  const startOf = (r: Row) => r.from

  it('returns null when the list is empty', () => {
    expect(pickCurrentActive<Row>([], isActive, startOf)).toBeNull()
  })

  it('returns null when no record is active', () => {
    const rows: Row[] = [
      { from: '2026-01-01', active: false },
      { from: '2026-03-01', active: false },
    ]
    expect(pickCurrentActive(rows, isActive, startOf)).toBeNull()
  })

  it('returns the single active record', () => {
    const rows: Row[] = [
      { from: '2026-01-01', active: false },
      { from: '2026-02-01', active: true },
    ]
    expect(pickCurrentActive(rows, isActive, startOf)).toEqual({ from: '2026-02-01', active: true })
  })

  it('picks the active record with the latest start date', () => {
    const rows: Row[] = [
      { from: '2026-01-01', active: true },
      { from: '2026-05-01', active: true },
      { from: '2026-03-01', active: true },
    ]
    expect(pickCurrentActive(rows, isActive, startOf)).toEqual({ from: '2026-05-01', active: true })
  })

  it('ignores inactive records even if they start later', () => {
    const rows: Row[] = [
      { from: '2026-01-01', active: true },
      { from: '2026-09-01', active: false },
    ]
    expect(pickCurrentActive(rows, isActive, startOf)).toEqual({ from: '2026-01-01', active: true })
  })
})

describe('flattenPhones', () => {
  it('returns an empty array for non-array input', () => {
    expect(flattenPhones(null)).toEqual([])
    expect(flattenPhones(undefined)).toEqual([])
    expect(flattenPhones('0501234567')).toEqual([])
    expect(flattenPhones({ number: '0501234567' })).toEqual([])
  })

  it('keeps plain string entries', () => {
    expect(flattenPhones(['0501234567', '036543210'])).toEqual(['0501234567', '036543210'])
  })

  it('extracts the number field from object entries', () => {
    expect(flattenPhones([{ number: '0501234567' }, { number: '036543210' }])).toEqual([
      '0501234567',
      '036543210',
    ])
  })

  it('drops empty and malformed entries', () => {
    expect(flattenPhones(['0501234567', '', { number: '' }, { foo: 'bar' }])).toEqual(['0501234567'])
  })
})

describe('hasAllergies', () => {
  it('is false for null/undefined', () => {
    expect(hasAllergies(null)).toBe(false)
    expect(hasAllergies(undefined)).toBe(false)
  })

  it('is false for an empty or whitespace-only string', () => {
    expect(hasAllergies('')).toBe(false)
    expect(hasAllergies('   ')).toBe(false)
  })

  it('is true for a non-empty allergies note', () => {
    expect(hasAllergies('בוטנים')).toBe(true)
    expect(hasAllergies('penicillin')).toBe(true)
  })
})
