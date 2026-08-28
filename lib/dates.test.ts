import { describe, it, expect } from 'vitest'
import { isoInTZ, todayISO, APP_TIME_ZONE, isIsoDate, daysUntil, rangesOverlap } from './dates'

describe('isoInTZ / todayISO (institution timezone)', () => {
  it('shifts a late-night UTC instant to the next day in Jerusalem', () => {
    // 23:30 UTC on 2026-01-15 is 01:30 on 2026-01-16 in Jerusalem (UTC+2 in winter).
    const inst = new Date('2026-01-15T23:30:00Z')
    expect(isoInTZ(inst, 'UTC')).toBe('2026-01-15')
    expect(isoInTZ(inst, 'Asia/Jerusalem')).toBe('2026-01-16')
  })

  it('handles summer DST (UTC+3) too', () => {
    // 22:30 UTC on 2026-07-10 is 01:30 on 2026-07-11 in Jerusalem (UTC+3 in summer).
    const inst = new Date('2026-07-10T22:30:00Z')
    expect(isoInTZ(inst, 'Asia/Jerusalem')).toBe('2026-07-11')
  })

  it('defaults to the institution timezone', () => {
    const inst = new Date('2026-01-15T23:30:00Z')
    expect(isoInTZ(inst)).toBe(isoInTZ(inst, APP_TIME_ZONE))
    expect(APP_TIME_ZONE).toBe('Asia/Jerusalem')
  })

  it('todayISO returns a valid YYYY-MM-DD equal to the Jerusalem date now', () => {
    const t = todayISO()
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(isIsoDate(t)).toBe(true)
    expect(t).toBe(isoInTZ(new Date(), 'Asia/Jerusalem'))
  })
})

describe('daysUntil / rangesOverlap (unchanged)', () => {
  it('daysUntil counts whole days, sign-aware', () => {
    expect(daysUntil('2026-01-10', '2026-01-01')).toBe(9)
    expect(daysUntil('2026-01-01', '2026-01-10')).toBe(-9)
    expect(daysUntil('2026-01-01', '2026-01-01')).toBe(0)
  })
  it('rangesOverlap treats null end as open-ended, inclusive bounds', () => {
    expect(rangesOverlap('2026-01-01', '2026-01-31', '2026-01-31', null)).toBe(true)
    expect(rangesOverlap('2026-01-01', '2026-01-10', '2026-01-11', null)).toBe(false)
  })
})
