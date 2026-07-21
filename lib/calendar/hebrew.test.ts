import { describe, it, expect } from 'vitest'
import { hebrewDateParts, formatHebrewDate, hebrewDayNumber, toGematria } from './hebrew'

// Текст еврейского календаря зависит от версии ICU, поэтому проверяем СТРУКТУРУ
// (непустые части, наличие названия месяца, детерминизм), а не точные строки.

describe('hebrewDateParts', () => {
  it('returns non-empty day / month / year for a valid date', () => {
    const p = hebrewDateParts('2026-07-08')
    expect(p.day).not.toBe('')
    expect(p.month).not.toBe('')
    expect(p.year).not.toBe('')
  })

  it('month part contains a Hebrew letter (month name, not a number)', () => {
    const p = hebrewDateParts('2026-07-08')
    // Любая буква ивритского блока Unicode U+0590..U+05FF.
    expect(/[\u0590-\u05FF]/.test(p.month)).toBe(true)
  })

  it('is deterministic (UTC-based, independent of local TZ)', () => {
    expect(hebrewDateParts('2026-01-01')).toEqual(hebrewDateParts('2026-01-01'))
  })

  it('different Gregorian dates yield different Hebrew parts', () => {
    const a = hebrewDateParts('2026-01-01')
    const b = hebrewDateParts('2026-09-15')
    expect(`${a.day}|${a.month}|${a.year}`).not.toBe(`${b.day}|${b.month}|${b.year}`)
  })

  it('day and year are Hebrew LETTERS (gematria), not Latin digits', () => {
    const p = hebrewDateParts('2026-07-08')
    expect(/[֐-׿]/.test(p.day)).toBe(true)
    expect(/[0-9]/.test(p.day)).toBe(false)
    expect(/[֐-׿]/.test(p.year)).toBe(true)
    expect(/[0-9]/.test(p.year)).toBe(false)
  })

  it('empty parts for malformed input', () => {
    expect(hebrewDateParts('nope')).toEqual({ day: '', month: '', year: '' })
    expect(hebrewDateParts('2026-13-40')).toEqual({ day: '', month: '', year: '' })
    expect(hebrewDateParts('')).toEqual({ day: '', month: '', year: '' })
  })
})

describe('formatHebrewDate', () => {
  it('returns a non-empty string containing a Hebrew month name', () => {
    const s = formatHebrewDate('2026-07-08')
    expect(s.length).toBeGreaterThan(0)
    expect(/[\u0590-\u05FF]/.test(s)).toBe(true)
  })

  it('empty string for malformed input', () => {
    expect(formatHebrewDate('2026/07/08')).toBe('')
    expect(formatHebrewDate('xxxx')).toBe('')
  })
})

describe('toGematria', () => {
  it('converts known values to Hebrew letters with geresh/gershayim', () => {
    expect(toGematria(23)).toBe('כ״ג')
    expect(toGematria(15)).toBe('ט״ו')   // спец-случай (не י-ה)
    expect(toGematria(16)).toBe('ט״ז')   // спец-случай (не י-ו)
    expect(toGematria(5)).toBe('ה׳')     // одиночная буква → гереш
    expect(toGematria(10)).toBe('י׳')
    expect(toGematria(786)).toBe('תשפ״ו') // год 5786 без тысяч
  })
})

describe('hebrewDayNumber', () => {
  it('matches the day part from hebrewDateParts', () => {
    expect(hebrewDayNumber('2026-07-08')).toBe(hebrewDateParts('2026-07-08').day)
  })

  it('non-empty for a valid date', () => {
    expect(hebrewDayNumber('2026-07-08')).not.toBe('')
  })

  it('empty for malformed input', () => {
    expect(hebrewDayNumber('bad')).toBe('')
  })
})
