import { describe, it, expect } from 'vitest'
import { monthRange, lessonHours, sumEntries } from './staff-comp'

describe('monthRange', () => {
  it('обычный месяц', () => {
    expect(monthRange(2026, 7)).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })
  it('февраль невисокосный', () => {
    expect(monthRange(2026, 2)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
  it('февраль високосный', () => {
    expect(monthRange(2028, 2)).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
  it('30-дневный месяц', () => {
    expect(monthRange(2026, 4)).toEqual({ from: '2026-04-01', to: '2026-04-30' })
  })
})

describe('lessonHours (2 урока по 1.5ч = 3ч)', () => {
  it('09:15–10:30 → 1.25ч', () => {
    expect(lessonHours('09:15', '10:30')).toBe(1.25)
  })
  it('11:00–12:10 → ~1.17ч', () => {
    expect(lessonHours('11:00', '12:10')).toBeCloseTo(1.17, 2)
  })
  it('ровно 1.5ч', () => {
    expect(lessonHours('09:00', '10:30')).toBe(1.5)
  })
  it('с секундами в строке', () => {
    expect(lessonHours('09:00:00', '10:30:00')).toBe(1.5)
  })
  it('нет конца/начала → null', () => {
    expect(lessonHours('09:00', null)).toBeNull()
    expect(lessonHours(null, '10:00')).toBeNull()
  })
  it('конец не позже начала → null', () => {
    expect(lessonHours('10:00', '10:00')).toBeNull()
    expect(lessonHours('11:00', '10:00')).toBeNull()
  })
})

describe('sumEntries (целые копейки, без float-дрейфа)', () => {
  it('суммирует стоимости', () => {
    expect(sumEntries([{ amount: '100.10' }, { amount: '200.20' }, { amount: 0.30 }])).toBe(300.6)
  })
  it('null amount игнорируется', () => {
    expect(sumEntries([{ amount: null }, { amount: '50' }])).toBe(50)
  })
  it('пусто → 0', () => {
    expect(sumEntries([])).toBe(0)
  })
})
