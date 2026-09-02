import { describe, it, expect } from 'vitest'
import { courseIssues, courseHasBlockingGap } from './course-checks'

describe('courseIssues', () => {
  it('flags a fully-empty course', () => {
    expect(courseIssues({ teacherCount: 0, hours: null, slotCount: 0, roomCount: 0 }))
      .toEqual(['no_teacher', 'no_hours', 'no_slot'])
  })
  it('flags a missing room only when some slots lack one', () => {
    expect(courseIssues({ teacherCount: 1, hours: 4, slotCount: 2, roomCount: 2 })).toEqual([])
    expect(courseIssues({ teacherCount: 1, hours: 4, slotCount: 2, roomCount: 1 })).toEqual(['no_room'])
  })
  it('detects hours shortfall and excess against scheduled hours', () => {
    expect(courseIssues({ teacherCount: 1, hours: 4, slotCount: 2, roomCount: 2, scheduledHours: 3 }))
      .toEqual(['hours_shortfall'])
    expect(courseIssues({ teacherCount: 1, hours: 4, slotCount: 2, roomCount: 2, scheduledHours: 5 }))
      .toEqual(['hours_excess'])
    expect(courseIssues({ teacherCount: 1, hours: 4, slotCount: 2, roomCount: 2, scheduledHours: 4 }))
      .toEqual([])
  })
  it('does not compare hours when the course has no declared hours', () => {
    expect(courseIssues({ teacherCount: 1, hours: null, slotCount: 1, roomCount: 1, scheduledHours: 3 }))
      .toEqual(['no_hours'])
  })
})

describe('courseHasBlockingGap', () => {
  it('is true when a teacher or slot is missing', () => {
    expect(courseHasBlockingGap({ teacherCount: 0, hours: 4, slotCount: 2, roomCount: 2 })).toBe(true)
    expect(courseHasBlockingGap({ teacherCount: 1, hours: 4, slotCount: 0, roomCount: 0 })).toBe(true)
  })
  it('is false when teacher and slots exist (room/hours are non-blocking)', () => {
    expect(courseHasBlockingGap({ teacherCount: 1, hours: null, slotCount: 1, roomCount: 0 })).toBe(false)
  })
})
