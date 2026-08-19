import { describe, it, expect } from 'vitest'
import { isIsoDate } from './validation'

describe('isIsoDate', () => {
  it('принимает корректные ISO-даты', () => {
    expect(isIsoDate('2026-07-07')).toBe(true)
    expect(isIsoDate('2000-01-01')).toBe(true)
    expect(isIsoDate('2024-02-29')).toBe(true) // високосный
  })

  it('отклоняет неверный формат', () => {
    expect(isIsoDate('2026-7-7')).toBe(false)
    expect(isIsoDate('07/07/2026')).toBe(false)
    expect(isIsoDate('2026-07-07T00:00:00')).toBe(false)
    expect(isIsoDate('')).toBe(false)
    expect(isIsoDate('abcd-ef-gh')).toBe(false)
  })

  it('отклоняет несуществующие календарные даты', () => {
    expect(isIsoDate('2026-02-31')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-00-10')).toBe(false)
    expect(isIsoDate('2025-02-29')).toBe(false) // не високосный
  })
})
