import { describe, it, expect } from 'vitest'
import { birthdayInstances } from './birthday'

// ─────────────────────────────────────────────
// birthdayInstances
// ─────────────────────────────────────────────

describe('birthdayInstances', () => {
  it('recurs once per year across a multi-year range (inclusive)', () => {
    const r = birthdayInstances('1990-06-15', '2025-01-01', '2027-12-31')
    expect(r).toEqual([
      { dateISO: '2025-06-15', age: 35 },
      { dateISO: '2026-06-15', age: 36 },
      { dateISO: '2027-06-15', age: 37 },
    ])
  })

  it('includes the exact birth-date year with age 0', () => {
    const r = birthdayInstances('2020-05-10', '2020-01-01', '2020-12-31')
    expect(r).toEqual([{ dateISO: '2020-05-10', age: 0 }])
  })

  it('range boundaries are inclusive (birthday exactly on from/to)', () => {
    const r = birthdayInstances('1990-06-15', '2026-06-15', '2027-06-15')
    expect(r).toEqual([
      { dateISO: '2026-06-15', age: 36 },
      { dateISO: '2027-06-15', age: 37 },
    ])
  })

  it('Feb 29 birthday celebrates on Feb 28 in a non-leap year', () => {
    // 2026 — невисокосный → 28 февраля; 2024 — високосный → 29 февраля.
    const r = birthdayInstances('2000-02-29', '2024-01-01', '2026-12-31')
    expect(r).toEqual([
      { dateISO: '2024-02-29', age: 24 },
      { dateISO: '2025-02-28', age: 25 },
      { dateISO: '2026-02-28', age: 26 },
    ])
  })

  it('null birth_date → []', () => {
    expect(birthdayInstances(null, '2026-01-01', '2026-12-31')).toEqual([])
  })

  it('invalid birth_date → []', () => {
    expect(birthdayInstances('nope', '2026-01-01', '2026-12-31')).toEqual([])
    expect(birthdayInstances('1990-13-40', '2026-01-01', '2026-12-31')).toEqual([])
  })

  it('birthday out of the visible range → []', () => {
    // ДР 15 июня, окно — только январь.
    const r = birthdayInstances('1990-06-15', '2026-01-01', '2026-01-31')
    expect(r).toEqual([])
  })

  it('clamps "before birth": no birthday before the person was born', () => {
    // Родился в 2020; годы 2018/2019 — до рождения, пропускаются.
    const r = birthdayInstances('2020-05-10', '2018-01-01', '2022-12-31')
    expect(r).toEqual([
      { dateISO: '2020-05-10', age: 0 },
      { dateISO: '2021-05-10', age: 1 },
      { dateISO: '2022-05-10', age: 2 },
    ])
    expect(r.every(i => i.age >= 0)).toBe(true)
  })

  it('from > to → []', () => {
    expect(birthdayInstances('1990-06-15', '2027-01-01', '2026-01-01')).toEqual([])
  })

  it('handles a range that straddles a year boundary', () => {
    // ДР 1 января: окно 2025-12-31 .. 2026-01-02 захватывает 2026-01-01.
    const r = birthdayInstances('1995-01-01', '2025-12-31', '2026-01-02')
    expect(r).toEqual([{ dateISO: '2026-01-01', age: 31 }])
  })
})
