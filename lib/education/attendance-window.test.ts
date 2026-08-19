import { describe, it, expect } from 'vitest'
import { attendanceDeadlineMs, isWithinAttendanceWindow } from './attendance-window'

// В июле Израиль на летнем времени UTC+3, поэтому 07:20Z = 10:20 по местному.
const dateJul = '2026-07-15'

describe('attendanceDeadlineMs', () => {
  it('конец урока + 30 мин по умолчанию', () => {
    const dl = attendanceDeadlineMs({ scheduledDate: dateJul, scheduledTime: '09:00', scheduledEndTime: '10:00' })
    expect(dl).toBe(Date.UTC(2026, 6, 15, 10, 30))
  })

  it('доп. время учителя добавляется', () => {
    const dl = attendanceDeadlineMs({ scheduledDate: dateJul, scheduledTime: '09:00', scheduledEndTime: '10:00', extraMinutes: 60 })
    expect(dl).toBe(Date.UTC(2026, 6, 15, 11, 30))
  })

  it('нет конца — берётся длительность по умолчанию (120) + grace', () => {
    const dl = attendanceDeadlineMs({ scheduledDate: dateJul, scheduledTime: '09:00', scheduledEndTime: null })
    expect(dl).toBe(Date.UTC(2026, 6, 15, 11, 30)) // 09:00 + 120 + 30
  })

  it('нет времени вовсе — окно до конца дня + grace', () => {
    const dl = attendanceDeadlineMs({ scheduledDate: dateJul, scheduledTime: null, scheduledEndTime: null })
    expect(dl).toBe(Date.UTC(2026, 6, 15, 23, 59) + 30 * 60000)
  })
})

describe('isWithinAttendanceWindow (Asia/Jerusalem, июль = UTC+3)', () => {
  const lesson = { scheduledDate: dateJul, scheduledTime: '09:00', scheduledEndTime: '10:00' } // дедлайн 10:30 местного

  it('за 10 минут до дедлайна — можно (10:20 местного = 07:20Z)', () => {
    expect(isWithinAttendanceWindow(new Date('2026-07-15T07:20:00Z'), lesson)).toBe(true)
  })

  it('после дедлайна — нельзя (11:00 местного = 08:00Z)', () => {
    expect(isWithinAttendanceWindow(new Date('2026-07-15T08:00:00Z'), lesson)).toBe(false)
  })

  it('во время урока — можно', () => {
    expect(isWithinAttendanceWindow(new Date('2026-07-15T06:30:00Z'), lesson)).toBe(true) // 09:30 местного
  })

  it('доп. время сдвигает границу (11:00 местного при +60 → можно)', () => {
    expect(isWithinAttendanceWindow(new Date('2026-07-15T08:00:00Z'), { ...lesson, extraMinutes: 60 })).toBe(true)
  })
})
