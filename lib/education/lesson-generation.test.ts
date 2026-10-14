import { describe, it, expect } from 'vitest'
import { clampHorizonToPeriod, slotWouldRegenerate } from './lesson-generation'
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

// Удалённый урок, который недельный слот породит снова, отменяется вместо
// удаления (иначе ночной cron вернёт его). 2026-10-18 — воскресенье (ISO 7),
// 2026-10-19 — понедельник (ISO 1).
describe('slotWouldRegenerate', () => {
  const slots = [
    { day_of_week: 1, start_time: '09:00:00' },
    { day_of_week: 3, start_time: '10:00:00', approval_status: 'pending' },
  ]

  it('слот того же дня и времени — урок вернётся', () => {
    expect(slotWouldRegenerate(slots, '2026-10-19', '09:00:00')).toBe(true)
    expect(slotWouldRegenerate(slots, '2026-10-19', '09:00')).toBe(true)
  })

  it('другое время или другой день — не вернётся', () => {
    expect(slotWouldRegenerate(slots, '2026-10-19', '09:30:00')).toBe(false)
    expect(slotWouldRegenerate(slots, '2026-10-18', '09:00:00')).toBe(false)
  })

  it('слот на утверждении не порождает уроков', () => {
    expect(slotWouldRegenerate(slots, '2026-10-21', '10:00:00')).toBe(false)
  })

  it('урок без времени — не из слота', () => {
    expect(slotWouldRegenerate(slots, '2026-10-19', null)).toBe(false)
  })
})
