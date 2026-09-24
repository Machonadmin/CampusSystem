import { describe, it, expect } from 'vitest'
import { clampHorizonToPeriod } from './lesson-generation'
import { parseDateUTC, MS_PER_DAY } from './schedule-dates'

// Горизонт ежедневного cron-а генерации уроков: [сегодня; сегодня+N-1],
// подрезанный периодом группы. Ошибка здесь = уроки за пределами семестра
// или пропущенные дни в начале.
describe('clampHorizonToPeriod', () => {
  const d = (s: string) => parseDateUTC(s)!

  it('без периода — полный горизонт N дней от сегодня', () => {
    const h = clampHorizonToPeriod('2026-09-01', 14, null, null)!
    expect(h.fromMs).toBe(d('2026-09-01'))
    expect(h.toMs).toBe(d('2026-09-01') + 13 * MS_PER_DAY)
  })

  it('period_end внутри горизонта подрезает конец', () => {
    const h = clampHorizonToPeriod('2026-09-01', 14, '2026-08-01', '2026-09-05')!
    expect(h.fromMs).toBe(d('2026-09-01'))
    expect(h.toMs).toBe(d('2026-09-05'))
  })

  it('period_start в будущем подрезает начало (семестр ещё не начался)', () => {
    const h = clampHorizonToPeriod('2026-09-01', 14, '2026-09-10', '2027-01-31')!
    expect(h.fromMs).toBe(d('2026-09-10'))
    expect(h.toMs).toBe(d('2026-09-01') + 13 * MS_PER_DAY)
  })

  it('семестр уже закончился → null (генерировать нечего)', () => {
    expect(clampHorizonToPeriod('2026-09-01', 14, '2026-01-01', '2026-06-30')).toBeNull()
  })

  it('семестр начинается за горизонтом → null', () => {
    expect(clampHorizonToPeriod('2026-09-01', 14, '2026-10-01', '2027-01-31')).toBeNull()
  })

  it('однодневный горизонт', () => {
    const h = clampHorizonToPeriod('2026-09-01', 1, null, null)!
    expect(h.fromMs).toBe(h.toMs)
  })

  it('битая дата «сегодня» → null', () => {
    expect(clampHorizonToPeriod('not-a-date', 14, null, null)).toBeNull()
  })
})
