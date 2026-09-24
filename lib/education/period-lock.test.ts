import { describe, it, expect } from 'vitest'
import { periodKey, samePeriod, isPastPeriod, resolveReadOnly, isPeriodPast, periodContainsToday, currentPeriodKey } from './period-lock'

describe('periodKey / samePeriod', () => {
  it('builds a stable key with and without a term', () => {
    expect(periodKey({ yearLabel: 'תשפז' })).toBe('תשפז#')
    expect(periodKey({ yearLabel: 'תשפז', term: 2 })).toBe('תשפז#2')
    expect(periodKey({ yearLabel: 'תשפז', term: null })).toBe('תשפז#')
  })
  it('compares periods by key', () => {
    expect(samePeriod({ yearLabel: 'תשפז', term: 1 }, { yearLabel: 'תשפז', term: 1 })).toBe(true)
    expect(samePeriod({ yearLabel: 'תשפז', term: 1 }, { yearLabel: 'תשפז', term: 2 })).toBe(false)
  })
})

describe('isPastPeriod', () => {
  const ordered = ['תשפה#', 'תשפו#', 'תשפז#'] // oldest → newest

  it('is true for a period before current', () => {
    expect(isPastPeriod(ordered, 'תשפז#', 'תשפה#')).toBe(true)
    expect(isPastPeriod(ordered, 'תשפז#', 'תשפו#')).toBe(true)
  })
  it('is false for the current period', () => {
    expect(isPastPeriod(ordered, 'תשפז#', 'תשפז#')).toBe(false)
  })
  it('is false for a future period', () => {
    expect(isPastPeriod(ordered, 'תשפו#', 'תשפז#')).toBe(false)
  })
  it('fails open (not past) when keys are unknown or current is null', () => {
    expect(isPastPeriod(ordered, null, 'תשפה#')).toBe(false)
    expect(isPastPeriod(ordered, 'תשפז#', 'unknown#')).toBe(false)
    expect(isPastPeriod(ordered, 'unknown#', 'תשפה#')).toBe(false)
  })
})

describe('resolveReadOnly', () => {
  const ordered = ['תשפה#', 'תשפו#', 'תשפז#']

  it('read-only for a past period', () => {
    expect(resolveReadOnly(ordered, 'תשפז#', 'תשפה#')).toBe(true)
  })
  it('editable for the current period', () => {
    expect(resolveReadOnly(ordered, 'תשפז#', 'תשפז#')).toBe(false)
  })
  it('editable when nothing selected', () => {
    expect(resolveReadOnly(ordered, 'תשפז#', null)).toBe(false)
  })
  it('read-only when the selected key is explicitly closed', () => {
    expect(resolveReadOnly(ordered, 'תשפז#', 'תשפז#', { closedKeys: ['תשפז#'] })).toBe(true)
  })
})

// ─── Date-based model (spec §4.11) ───────────────────────────────────────────
const TODAY = '2026-09-02'

describe('isPeriodPast (date-based)', () => {
  it('is true only when the end date is strictly before today', () => {
    expect(isPeriodPast('2026-08-01', TODAY)).toBe(true)
    expect(isPeriodPast('2026-09-02', TODAY)).toBe(false) // ends today → still current
    expect(isPeriodPast('2027-01-01', TODAY)).toBe(false)
    expect(isPeriodPast(null, TODAY)).toBe(false)
  })
})

describe('periodContainsToday', () => {
  it('respects both bounds; null bounds are open', () => {
    expect(periodContainsToday({ key: 'a', start: '2026-09-01', end: '2026-12-31' }, TODAY)).toBe(true)
    expect(periodContainsToday({ key: 'b', start: '2026-10-01', end: '2026-12-31' }, TODAY)).toBe(false)
    expect(periodContainsToday({ key: 'c', start: null, end: '2026-12-31' }, TODAY)).toBe(true)
    expect(periodContainsToday({ key: 'd', start: '2026-01-01', end: null }, TODAY)).toBe(true)
  })
})

describe('currentPeriodKey', () => {
  it('picks the period whose range contains today', () => {
    const periods = [
      { key: 'past', start: '2026-01-01', end: '2026-06-30' },
      { key: 'now', start: '2026-09-01', end: '2026-12-31' },
      { key: 'future', start: '2027-01-01', end: '2027-06-30' },
    ]
    expect(currentPeriodKey(periods, TODAY)).toBe('now')
  })
  it('falls back to the latest-ending period when none contains today', () => {
    const periods = [
      { key: 'old', start: '2025-01-01', end: '2025-06-30' },
      { key: 'older', start: '2024-01-01', end: '2024-06-30' },
    ]
    expect(currentPeriodKey(periods, TODAY)).toBe('old')
  })
  it('returns null for no periods', () => {
    expect(currentPeriodKey([], TODAY)).toBe(null)
  })
})
