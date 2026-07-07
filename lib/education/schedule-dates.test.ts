import { describe, it, expect } from 'vitest'
import { parseDateUTC, fmtDateUTC, isoWeekday, MS_PER_DAY } from './schedule-dates'

describe('parseDateUTC', () => {
  it('парсит корректную дату в UTC-полночь', () => {
    expect(parseDateUTC('2026-01-01')).toBe(Date.UTC(2026, 0, 1))
    expect(parseDateUTC('2026-07-07')).toBe(Date.UTC(2026, 6, 7))
  })

  it('отклоняет неверный формат', () => {
    expect(parseDateUTC('2026-7-7')).toBeNull()
    expect(parseDateUTC('07-07-2026')).toBeNull()
    expect(parseDateUTC('')).toBeNull()
  })

  it('отклоняет несуществующие даты', () => {
    expect(parseDateUTC('2026-02-31')).toBeNull()
    expect(parseDateUTC('2026-13-01')).toBeNull()
    expect(parseDateUTC('2025-02-29')).toBeNull()
  })

  it('принимает високосное 29 февраля', () => {
    expect(parseDateUTC('2024-02-29')).toBe(Date.UTC(2024, 1, 29))
  })
})

describe('fmtDateUTC', () => {
  it('форматирует UTC ms в YYYY-MM-DD с ведущими нулями', () => {
    expect(fmtDateUTC(Date.UTC(2026, 0, 1))).toBe('2026-01-01')
    expect(fmtDateUTC(Date.UTC(2026, 6, 7))).toBe('2026-07-07')
    expect(fmtDateUTC(Date.UTC(2026, 11, 31))).toBe('2026-12-31')
  })

  it('обратен parseDateUTC (round-trip)', () => {
    for (const s of ['2026-01-01', '2026-07-07', '2024-02-29', '2026-12-31']) {
      expect(fmtDateUTC(parseDateUTC(s)!)).toBe(s)
    }
  })
})

describe('isoWeekday', () => {
  it('1=понедельник .. 7=воскресенье', () => {
    // 2026-07-06 — понедельник
    expect(isoWeekday(Date.UTC(2026, 6, 6))).toBe(1)
    expect(isoWeekday(Date.UTC(2026, 6, 7))).toBe(2) // вторник
    expect(isoWeekday(Date.UTC(2026, 6, 11))).toBe(6) // суббота
    expect(isoWeekday(Date.UTC(2026, 6, 12))).toBe(7) // воскресенье
  })

  it('воскресенье превращается из 0 (getUTCDay) в 7', () => {
    // 2026-07-05 — воскресенье, getUTCDay()=0
    expect(new Date(Date.UTC(2026, 6, 5)).getUTCDay()).toBe(0)
    expect(isoWeekday(Date.UTC(2026, 6, 5))).toBe(7)
  })

  it('согласуется с шагом в один день по кругу недели', () => {
    let ms = Date.UTC(2026, 6, 6) // понедельник = 1
    const seq: number[] = []
    for (let i = 0; i < 8; i++) {
      seq.push(isoWeekday(ms))
      ms += MS_PER_DAY
    }
    expect(seq).toEqual([1, 2, 3, 4, 5, 6, 7, 1])
  })
})
