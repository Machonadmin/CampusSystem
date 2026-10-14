import { describe, it, expect } from 'vitest'
import {
  localParts, previousDate, weekdayOfDate, timeToMinutes, shortTime, parseSchedule,
  pairsForMorning, pairsToAsk, QUESTION_DELAY_MIN, type ScheduledPair,
} from './schedule'

const pair = (over: Partial<ScheduledPair> = {}): ScheduledPair => ({
  id: 'p1', teacher_person_id: 't1', student_journey_id: 'j1',
  weekday: 3, start_time: '16:00:00', created_at: '2026-10-01T08:00:00Z', ...over,
})

describe('localParts — время учреждения (Asia/Jerusalem)', () => {
  it('летнее время: UTC+3', () => {
    expect(localParts(new Date('2026-10-14T13:30:00Z'))).toEqual({ date: '2026-10-14', weekday: 3, minutes: 16 * 60 + 30 })
  })
  it('зимнее время: UTC+2', () => {
    expect(localParts(new Date('2026-12-02T13:30:00Z'))).toEqual({ date: '2026-12-02', weekday: 3, minutes: 15 * 60 + 30 })
  })
  it('после полуночи по Израилю дата уже следующая, хотя в UTC ещё вчера', () => {
    expect(localParts(new Date('2026-10-13T22:30:00Z'))).toEqual({ date: '2026-10-14', weekday: 3, minutes: 90 })
  })
})

describe('даты и время', () => {
  it('previousDate через границу месяца и года', () => {
    expect(previousDate('2026-11-01')).toBe('2026-10-31')
    expect(previousDate('2027-01-01')).toBe('2026-12-31')
  })
  it('weekdayOfDate', () => {
    expect(weekdayOfDate('2026-10-14')).toBe(3)
    expect(weekdayOfDate('2026-10-18')).toBe(0)
  })
  it('timeToMinutes / shortTime', () => {
    expect(timeToMinutes('16:00:00')).toBe(960)
    expect(timeToMinutes('7:05')).toBe(425)
    expect(timeToMinutes('24:00')).toBeNull()
    expect(timeToMinutes('')).toBeNull()
    expect(shortTime('16:00:00')).toBe('16:00')
    expect(shortTime('7:05')).toBe('07:05')
  })
})

describe('parseSchedule', () => {
  it('пустое тело — ничего не меняет', () => {
    expect(parseSchedule({})).toEqual({})
  })
  it('день и время', () => {
    expect(parseSchedule({ weekday: 3, start_time: '16:30' })).toEqual({ weekday: 3, start_time: '16:30' })
    expect(parseSchedule({ weekday: '0', start_time: '08:00:00' })).toEqual({ weekday: 0, start_time: '08:00' })
  })
  it('null и пустая строка очищают', () => {
    expect(parseSchedule({ weekday: null, start_time: '' })).toEqual({ weekday: null, start_time: null })
  })
  it('неверные значения', () => {
    expect(parseSchedule({ weekday: 7 })).toBeNull()
    expect(parseSchedule({ weekday: 2.5 })).toBeNull()
    expect(parseSchedule({ start_time: '25:00' })).toBeNull()
    expect(parseSchedule({ start_time: 1600 })).toBeNull()
  })
})

describe('утреннее напоминание', () => {
  const wed = (minutes: number) => ({ date: '2026-10-14', weekday: 3, minutes })
  it('в день встречи с 06:00 и до начала', () => {
    expect(pairsForMorning([pair()], wed(9 * 60))).toHaveLength(1)
    expect(pairsForMorning([pair()], wed(15 * 60 + 59))).toHaveLength(1)
  })
  it('не ночью, не после начала, не в другой день', () => {
    expect(pairsForMorning([pair()], wed(5 * 60 + 59))).toHaveLength(0)
    expect(pairsForMorning([pair()], wed(16 * 60))).toHaveLength(0)
    expect(pairsForMorning([pair({ weekday: 2 })], wed(9 * 60))).toHaveLength(0)
  })
})

describe('вопрос «התקיימה?»', () => {
  const wed = (minutes: number) => ({ date: '2026-10-14', weekday: 3, minutes })
  const thu = (minutes: number) => ({ date: '2026-10-15', weekday: 4, minutes })

  it(`сегодня — только через ${QUESTION_DELAY_MIN} минут после начала`, () => {
    expect(pairsToAsk([pair()], wed(16 * 60 + QUESTION_DELAY_MIN - 1))).toHaveLength(0)
    expect(pairsToAsk([pair()], wed(16 * 60 + QUESTION_DELAY_MIN))).toEqual([{ pair: pair(), date: '2026-10-14' }])
  })
  it('вчерашняя встреча спрашивается на следующий день (утренний cron)', () => {
    expect(pairsToAsk([pair()], thu(9 * 60))).toEqual([{ pair: pair(), date: '2026-10-14' }])
  })
  it('воскресная встреча в понедельник: неделя замыкается', () => {
    const p = pair({ weekday: 0 })
    expect(pairsToAsk([p], { date: '2026-10-19', weekday: 1, minutes: 9 * 60 })).toEqual([{ pair: p, date: '2026-10-18' }])
  })
  it('не спрашивает про встречу раньше, чем пару завели', () => {
    // Завели в среду в 17:00 по Израилю (14:00 UTC), встреча была в 16:00.
    const late = pair({ created_at: '2026-10-14T14:00:00Z' })
    expect(pairsToAsk([late], wed(20 * 60))).toHaveLength(0)
    expect(pairsToAsk([late], thu(9 * 60))).toHaveLength(0)
    // Завели в среду утром — спрашивает.
    const early = pair({ created_at: '2026-10-14T06:00:00Z' })
    expect(pairsToAsk([early], wed(20 * 60))).toHaveLength(1)
  })
  it('другие дни не трогает', () => {
    expect(pairsToAsk([pair({ weekday: 1 })], wed(20 * 60))).toHaveLength(0)
  })
})
