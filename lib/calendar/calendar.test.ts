import { describe, it, expect } from 'vitest'
import {
  monthGrid,
  daysInMonth,
  toISODate,
  rangesOverlap,
  appointmentsForDay,
  isBlocked,
  minutesBetween,
  lessonsForDay,
  toHHmm,
  mergeDayEvents,
} from './calendar'

// ─────────────────────────────────────────────
// daysInMonth / toISODate
// ─────────────────────────────────────────────

describe('daysInMonth', () => {
  it('handles 31/30-day months', () => {
    expect(daysInMonth(2026, 1)).toBe(31)   // январь
    expect(daysInMonth(2026, 4)).toBe(30)   // апрель
    expect(daysInMonth(2026, 12)).toBe(31)  // декабрь
  })

  it('handles February leap vs non-leap', () => {
    expect(daysInMonth(2024, 2)).toBe(29)   // високосный
    expect(daysInMonth(2026, 2)).toBe(28)   // обычный
    expect(daysInMonth(2000, 2)).toBe(29)   // делится на 400
    expect(daysInMonth(1900, 2)).toBe(28)   // делится на 100, не на 400
  })
})

describe('toISODate', () => {
  it('pads month and day', () => {
    expect(toISODate(2026, 1, 5)).toBe('2026-01-05')
    expect(toISODate(2026, 12, 31)).toBe('2026-12-31')
  })
})

// ─────────────────────────────────────────────
// monthGrid
// ─────────────────────────────────────────────

describe('monthGrid', () => {
  it('every week has exactly 7 cells', () => {
    const grid = monthGrid(2026, 7)
    for (const week of grid) expect(week).toHaveLength(7)
  })

  it('grid length is a multiple of 7', () => {
    const flat = monthGrid(2026, 7).flat()
    expect(flat.length % 7).toBe(0)
  })

  it('contains all days of the month marked inMonth', () => {
    const flat = monthGrid(2026, 2).flat()
    const inMonth = flat.filter(c => c.inMonth)
    expect(inMonth).toHaveLength(28) // февраль 2026 = 28 дней
    expect(inMonth[0].dateISO).toBe('2026-02-01')
    expect(inMonth[inMonth.length - 1].dateISO).toBe('2026-02-28')
  })

  it('leap February (2024) has 29 in-month days', () => {
    const inMonth = monthGrid(2024, 2).flat().filter(c => c.inMonth)
    expect(inMonth).toHaveLength(29)
    expect(inMonth[28].dateISO).toBe('2024-02-29')
  })

  it('starts on Sunday by default — first cell is a Sunday', () => {
    const grid = monthGrid(2026, 7)
    const firstISO = grid[0][0].dateISO
    // 2026-07-01 — среда; ведущие дни июня.
    expect(new Date(`${firstISO}T00:00:00Z`).getUTCDay()).toBe(0)
  })

  it('respects weekStartsOn = Monday', () => {
    const grid = monthGrid(2026, 7, 1)
    const firstISO = grid[0][0].dateISO
    expect(new Date(`${firstISO}T00:00:00Z`).getUTCDay()).toBe(1)
  })

  it('leading days belong to the previous month (Dec→Jan boundary)', () => {
    // Январь 2026: 1-е — четверг → 4 ведущих дня декабря 2025.
    const grid = monthGrid(2026, 1)
    const lead = grid[0].filter(c => !c.inMonth)
    expect(lead[0].dateISO.startsWith('2025-12')).toBe(true)
    expect(grid.flat().find(c => c.inMonth)?.dateISO).toBe('2026-01-01')
  })

  it('trailing days belong to the next month (Dec→Jan boundary)', () => {
    // Декабрь 2026: замыкающие дни — январь 2027.
    const grid = monthGrid(2026, 12)
    const trailing = grid.flat().filter(c => !c.inMonth && c.dateISO > '2026-12-31')
    if (trailing.length > 0) expect(trailing[0].dateISO.startsWith('2027-01')).toBe(true)
  })

  it('a month starting on Sunday has no leading days', () => {
    // Февраль 2026: 1-е — воскресенье.
    const grid = monthGrid(2026, 2)
    expect(grid[0][0].dateISO).toBe('2026-02-01')
    expect(grid[0][0].inMonth).toBe(true)
  })
})

// ─────────────────────────────────────────────
// rangesOverlap
// ─────────────────────────────────────────────

describe('rangesOverlap', () => {
  const A = '2026-07-08T10:00:00Z'
  const B = '2026-07-08T11:00:00Z'
  const C = '2026-07-08T11:30:00Z'
  const D = '2026-07-08T12:00:00Z'

  it('true when intervals genuinely overlap', () => {
    expect(rangesOverlap(A, C, B, D)).toBe(true)
  })

  it('false when touching at the boundary (aEnd == bStart)', () => {
    expect(rangesOverlap(A, B, B, D)).toBe(false)
  })

  it('false when touching at the boundary (bEnd == aStart)', () => {
    expect(rangesOverlap(B, D, A, B)).toBe(false)
  })

  it('false when fully disjoint', () => {
    expect(rangesOverlap(A, B, C, D)).toBe(false)
  })

  it('true when one contains the other', () => {
    expect(rangesOverlap(A, D, B, C)).toBe(true)
  })

  it('true for identical intervals', () => {
    expect(rangesOverlap(A, D, A, D)).toBe(true)
  })

  it('false for a degenerate (zero-length) interval', () => {
    expect(rangesOverlap(A, A, A, D)).toBe(false)
  })

  it('false on unparseable input', () => {
    expect(rangesOverlap('nope', B, A, D)).toBe(false)
  })

  it('handles TZ-offset timestamps by absolute moment', () => {
    // 10:00Z == 13:00+03:00 → пересечение с 09:30Z..10:30Z.
    expect(rangesOverlap('2026-07-08T13:00:00+03:00', '2026-07-08T14:00:00+03:00',
      '2026-07-08T09:30:00Z', '2026-07-08T10:30:00Z')).toBe(true)
  })
})

// ─────────────────────────────────────────────
// appointmentsForDay
// ─────────────────────────────────────────────

describe('appointmentsForDay', () => {
  const appts = [
    { id: '1', starts_at: '2026-07-08T10:00:00Z' },
    { id: '2', starts_at: '2026-07-08T23:00:00Z' },
    { id: '3', starts_at: '2026-07-09T00:30:00Z' },
    { id: '4', starts_at: '2026-07-07T09:00:00Z' },
  ]

  it('returns only appointments starting on the given day', () => {
    const r = appointmentsForDay(appts, '2026-07-08')
    expect(r.map(a => a.id)).toEqual(['1', '2'])
  })

  it('preserves input order', () => {
    const r = appointmentsForDay(appts, '2026-07-08')
    expect(r[0].id).toBe('1')
  })

  it('empty input → empty output', () => {
    expect(appointmentsForDay([], '2026-07-08')).toEqual([])
  })

  it('no matches → empty output', () => {
    expect(appointmentsForDay(appts, '2026-01-01')).toEqual([])
  })

  it('accepts timestamps without a timezone suffix', () => {
    const r = appointmentsForDay([{ id: 'x', starts_at: '2026-07-08T14:30' }], '2026-07-08')
    expect(r).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────
// isBlocked
// ─────────────────────────────────────────────

describe('isBlocked', () => {
  const blocks = [
    { id: 'b1', block_date: '2026-07-08' },
    { id: 'b2', block_date: '2026-07-10' },
  ]

  it('true for a blocked date', () => {
    expect(isBlocked(blocks, '2026-07-08')).toBe(true)
  })

  it('false for a non-blocked date', () => {
    expect(isBlocked(blocks, '2026-07-09')).toBe(false)
  })

  it('empty blocks → false', () => {
    expect(isBlocked([], '2026-07-08')).toBe(false)
  })
})

// ─────────────────────────────────────────────
// minutesBetween
// ─────────────────────────────────────────────

describe('minutesBetween', () => {
  it('computes whole minutes', () => {
    expect(minutesBetween('2026-07-08T10:00:00Z', '2026-07-08T11:30:00Z')).toBe(90)
  })

  it('30-minute slot', () => {
    expect(minutesBetween('2026-07-08T10:00:00Z', '2026-07-08T10:30:00Z')).toBe(30)
  })

  it('crosses midnight', () => {
    expect(minutesBetween('2026-07-08T23:30:00Z', '2026-07-09T00:30:00Z')).toBe(60)
  })

  it('0 for unparseable input', () => {
    expect(minutesBetween('nope', '2026-07-08T10:30:00Z')).toBe(0)
  })
})

// ─────────────────────────────────────────────
// lessonsForDay
// ─────────────────────────────────────────────

describe('lessonsForDay', () => {
  const lessons = [
    { id: 'l1', date: '2026-07-08', time: '09:00:00' },
    { id: 'l2', date: '2026-07-08', time: null },
    { id: 'l3', date: '2026-07-09', time: '10:00:00' },
  ]

  it('returns only lessons on the given day', () => {
    const r = lessonsForDay(lessons, '2026-07-08')
    expect(r.map(l => l.id)).toEqual(['l1', 'l2'])
  })

  it('preserves input order', () => {
    expect(lessonsForDay(lessons, '2026-07-08')[0].id).toBe('l1')
  })

  it('empty input → empty output', () => {
    expect(lessonsForDay([], '2026-07-08')).toEqual([])
  })

  it('no matches → empty output', () => {
    expect(lessonsForDay(lessons, '2026-01-01')).toEqual([])
  })

  it('keeps time-less lessons on their day', () => {
    expect(lessonsForDay(lessons, '2026-07-08').some(l => l.id === 'l2')).toBe(true)
  })
})

// ─────────────────────────────────────────────
// toHHmm
// ─────────────────────────────────────────────

describe('toHHmm', () => {
  it('extracts HH:mm from an ISO timestamp (with TZ)', () => {
    expect(toHHmm('2026-07-08T09:05:00Z')).toBe('09:05')
  })

  it('extracts HH:mm from an ISO timestamp without TZ', () => {
    expect(toHHmm('2026-07-08T14:30')).toBe('14:30')
  })

  it("normalizes bare 'HH:mm:ss' to 'HH:mm'", () => {
    expect(toHHmm('09:00:00')).toBe('09:00')
  })

  it("keeps bare 'HH:mm' as is", () => {
    expect(toHHmm('16:45')).toBe('16:45')
  })

  it('null / undefined / empty → empty string', () => {
    expect(toHHmm(null)).toBe('')
    expect(toHHmm(undefined)).toBe('')
    expect(toHHmm('')).toBe('')
  })

  it('date-only or unparseable → empty string', () => {
    expect(toHHmm('2026-07-08')).toBe('')
    expect(toHHmm('nope')).toBe('')
  })
})

// ─────────────────────────────────────────────
// mergeDayEvents
// ─────────────────────────────────────────────

describe('mergeDayEvents', () => {
  const appts = [
    { id: 'a1', starts_at: '2026-07-08T11:00:00Z' },
    { id: 'a2', starts_at: '2026-07-08T08:00:00Z' },
    { id: 'a3', starts_at: '2026-07-09T09:00:00Z' },
  ]
  const lessons = [
    { id: 'l1', date: '2026-07-08', time: '10:00:00' },
    { id: 'l2', date: '2026-07-08', time: null },
    { id: 'l3', date: '2026-07-10', time: '08:00:00' },
  ]
  const schedule = [
    { slot_id: 's1', dateISO: '2026-07-08', start_time: '09:00:00' },
    { slot_id: 's2', dateISO: '2026-07-10', start_time: '08:00:00' },
  ]
  const tasks = [
    { id: 't1', due_date: '2026-07-08', due_time: '13:00:00', due_all_day: false },
    { id: 't2', due_date: '2026-07-08', due_time: null, due_all_day: true },
    { id: 't3', due_date: '2026-07-09', due_time: null, due_all_day: true },
  ]

  it('merges all four kinds of the day, sorted by time', () => {
    const r = mergeDayEvents(appts, lessons, schedule, tasks, '2026-07-08')
    // 08:00 appt, 09:00 schedule, 10:00 lesson, 11:00 appt, 13:00 task,
    // then time-less lesson and all-day task last (insertion order lesson→task).
    expect(r.map(e => e.kind)).toEqual([
      'appointment', 'schedule', 'lesson', 'appointment', 'task', 'lesson', 'task',
    ])
    expect(r.map(e => e.time)).toEqual(['08:00', '09:00', '10:00', '11:00', '13:00', '', ''])
  })

  it('tags each event with its source object', () => {
    const r = mergeDayEvents(appts, lessons, schedule, tasks, '2026-07-08')
    const first = r[0]
    expect(first.kind).toBe('appointment')
    expect(first.appointment?.id).toBe('a2')
    expect(first.lesson).toBeNull()
    expect(first.schedule).toBeNull()
    expect(first.task).toBeNull()
    const lessonEv = r.find(e => e.kind === 'lesson' && e.time === '10:00')
    expect(lessonEv?.lesson?.id).toBe('l1')
    const schedEv = r.find(e => e.kind === 'schedule')
    expect(schedEv?.schedule?.slot_id).toBe('s1')
    const taskEv = r.find(e => e.kind === 'task' && e.time === '13:00')
    expect(taskEv?.task?.id).toBe('t1')
  })

  it('includes only events of the requested day', () => {
    const r = mergeDayEvents(appts, lessons, schedule, tasks, '2026-07-08')
    expect(r).toHaveLength(7)
    expect(r.some(e => e.appointment?.id === 'a3')).toBe(false)
    expect(r.some(e => e.lesson?.id === 'l3')).toBe(false)
    expect(r.some(e => e.schedule?.slot_id === 's2')).toBe(false)
    expect(r.some(e => e.task?.id === 't3')).toBe(false)
  })

  it('all-day tasks and time-less lessons sort after timed events', () => {
    const r = mergeDayEvents(appts, lessons, schedule, tasks, '2026-07-08')
    const tail = r.slice(-2)
    expect(tail.map(e => e.kind)).toEqual(['lesson', 'task'])
    expect(tail.every(e => e.time === '')).toBe(true)
  })

  it('empty day → empty output', () => {
    expect(mergeDayEvents(appts, lessons, schedule, tasks, '2026-01-01')).toEqual([])
  })

  it('is stable for equal times: appointment → lesson → schedule → task', () => {
    const a = [{ id: 'a', starts_at: '2026-07-08T09:00:00Z' }]
    const l = [{ id: 'l', date: '2026-07-08', time: '09:00:00' }]
    const s = [{ slot_id: 's', dateISO: '2026-07-08', start_time: '09:00:00' }]
    const tk = [{ id: 't', due_date: '2026-07-08', due_time: '09:00:00', due_all_day: false }]
    const r = mergeDayEvents(a, l, s, tk, '2026-07-08')
    expect(r.map(e => e.kind)).toEqual(['appointment', 'lesson', 'schedule', 'task'])
  })
})
