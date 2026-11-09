import { describe, it, expect } from 'vitest'
import { taskReminderFor, daysBetween, addDaysISO, isValidRemindDaysBefore, taskReminderTitle } from './reminders'

describe('daysBetween / addDaysISO', () => {
  it('counts calendar days across month and year ends', () => {
    expect(daysBetween('2026-11-30', '2026-12-01')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-07')).toBe(7)
    expect(daysBetween('2026-11-05', '2026-11-03')).toBe(-2)
    expect(addDaysISO('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('taskReminderFor', () => {
  const today = '2026-11-10'
  it('no due date → nothing', () => {
    expect(taskReminderFor(today, null, 3)).toBeNull()
  })
  it('early reminder exactly N days before', () => {
    expect(taskReminderFor(today, '2026-11-13', 3)).toEqual({ kind: 'early', days: 3, key: 'early-3' })
    expect(taskReminderFor(today, '2026-11-14', 3)).toBeNull()
    expect(taskReminderFor(today, '2026-11-12', 3)).toBeNull()
  })
  it('no early reminder when not set; today/tomorrow are left to the old reminder', () => {
    expect(taskReminderFor(today, '2026-11-13', null)).toBeNull()
    expect(taskReminderFor(today, '2026-11-10', 2)).toBeNull()
    expect(taskReminderFor(today, '2026-11-11', 2)).toBeNull()
  })
  it('overdue on days 1, 3 and 7 only', () => {
    expect(taskReminderFor(today, '2026-11-09', null)).toEqual({ kind: 'overdue', days: 1, key: 'overdue-1' })
    expect(taskReminderFor(today, '2026-11-07', null)).toEqual({ kind: 'overdue', days: 3, key: 'overdue-3' })
    expect(taskReminderFor(today, '2026-11-03', 5)).toEqual({ kind: 'overdue', days: 7, key: 'overdue-7' })
    expect(taskReminderFor(today, '2026-11-08', null)).toBeNull()
    expect(taskReminderFor(today, '2026-11-01', null)).toBeNull()
  })
})

describe('isValidRemindDaysBefore', () => {
  it('accepts null and integers 2..30', () => {
    expect(isValidRemindDaysBefore(null)).toBe(true)
    expect(isValidRemindDaysBefore(2)).toBe(true)
    expect(isValidRemindDaysBefore(30)).toBe(true)
  })
  it('rejects the rest', () => {
    for (const v of [1, 31, 2.5, '3', undefined, -3]) expect(isValidRemindDaysBefore(v)).toBe(false)
  })
})

describe('taskReminderTitle', () => {
  it('builds Hebrew titles', () => {
    expect(taskReminderTitle({ kind: 'early', days: 3, key: 'early-3' }, 'X')).toBe('תזכורת, בעוד 3 ימים: X')
    expect(taskReminderTitle({ kind: 'overdue', days: 1, key: 'overdue-1' }, 'X')).toBe('משימה באיחור של יום: X')
    expect(taskReminderTitle({ kind: 'overdue', days: 7, key: 'overdue-7' }, 'X')).toBe('משימה באיחור של 7 ימים: X')
  })
})
