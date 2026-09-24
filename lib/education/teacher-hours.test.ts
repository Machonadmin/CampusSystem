import { describe, it, expect } from 'vitest'
import {
  aggregateActualHours,
  lessonsWithMultipleReports,
  attendanceMarkerFallback,
  type ApprovedAttendanceRow,
  type ActualLessonLite,
} from './teacher-hours'

const lesson = (id: string, over: Partial<ActualLessonLite> = {}): ActualLessonLite => ({
  id, scheduled_date: '2026-09-01', scheduled_time: '09:00', scheduled_end_time: '10:30',
  is_cancelled: false, class_group_id: 'g1', ...over,
})
const row = (lessonId: string, teacher: string, l: ActualLessonLite | null): ApprovedAttendanceRow =>
  ({ lesson_id: lessonId, teacher_person_id: teacher, lesson: l })

describe('aggregateActualHours', () => {
  it('sums approved lesson hours per teacher (2 × 1.5h = 3h)', () => {
    const r = aggregateActualHours([
      row('l1', 'A', lesson('l1')),
      row('l2', 'A', lesson('l2', { scheduled_date: '2026-09-02' })),
    ])
    const a = r.byTeacher.get('A')!
    expect(a.hours).toBe(3)
    expect(a.lessons).toBe(2)
    expect(a.items.map(i => i.lesson_id)).toEqual(['l1', 'l2'])
  })

  it('never counts cancelled lessons or rows without a lesson', () => {
    const r = aggregateActualHours([
      row('l1', 'A', lesson('l1', { is_cancelled: true })),
      row('l2', 'A', null),
    ])
    expect(r.byTeacher.get('A')).toBeUndefined()
    expect(r.noEndTime).toBe(0)
  })

  it('skips lessons without end time but counts them for the warning', () => {
    const r = aggregateActualHours([
      row('l1', 'A', lesson('l1', { scheduled_end_time: null })),
      row('l2', 'A', lesson('l2')),
    ])
    const a = r.byTeacher.get('A')!
    expect(a.hours).toBe(1.5)
    expect(a.lessons).toBe(1)
    expect(a.no_end_time).toBe(1)
    expect(r.noEndTime).toBe(1)
  })

  it('pays each approved teacher separately (co-teachers only if both approved) and dedups', () => {
    const r = aggregateActualHours([
      row('l1', 'A', lesson('l1')),
      row('l1', 'A', lesson('l1')), // дубль
      row('l1', 'B', lesson('l1')),
    ])
    expect(r.byTeacher.get('A')!.hours).toBe(1.5)
    expect(r.byTeacher.get('B')!.hours).toBe(1.5)
  })

  it('has no float drift (3 × 1.17h)', () => {
    const l = (id: string) => lesson(id, { scheduled_time: '11:00', scheduled_end_time: '12:10' })
    const r = aggregateActualHours([row('a', 'A', l('a')), row('b', 'A', l('b')), row('c', 'A', l('c'))])
    expect(r.byTeacher.get('A')!.hours).toBe(3.51)
  })
})

describe('lessonsWithMultipleReports (שני מורים דיווחו)', () => {
  it('flags a lesson reported by two different teachers', () => {
    const s = lessonsWithMultipleReports([
      { lesson_id: 'l1', teacher_person_id: 'A', status: 'reported' },
      { lesson_id: 'l1', teacher_person_id: 'B', status: 'approved' },
      { lesson_id: 'l2', teacher_person_id: 'A', status: 'reported' },
    ])
    expect([...s]).toEqual(['l1'])
  })

  it('ignores rejected reports', () => {
    const s = lessonsWithMultipleReports([
      { lesson_id: 'l1', teacher_person_id: 'A', status: 'reported' },
      { lesson_id: 'l1', teacher_person_id: 'B', status: 'rejected' },
    ])
    expect(s.size).toBe(0)
  })
})

describe('attendanceMarkerFallback (דווח דרך נוכחות תלמידות)', () => {
  it('proposes the attendance marker for a lesson with no teacher report', () => {
    const out = attendanceMarkerFallback(
      [{ lesson_id: 'l1', marked_by: 'SUB' }, { lesson_id: 'l1', marked_by: 'SUB' }],
      [],
    )
    expect(out).toEqual([{ lesson_id: 'l1', teacher_person_id: 'SUB', marks: 2 }])
  })

  it('does nothing when any teacher report exists for the lesson (any status)', () => {
    const out = attendanceMarkerFallback([{ lesson_id: 'l1', marked_by: 'SUB' }], [{ lesson_id: 'l1' }])
    expect(out).toEqual([])
  })

  it('picks the person who marked the most rows; ties are deterministic', () => {
    const out = attendanceMarkerFallback([
      { lesson_id: 'l1', marked_by: 'SEC' },
      { lesson_id: 'l1', marked_by: 'T' },
      { lesson_id: 'l1', marked_by: 'T' },
      { lesson_id: 'l2', marked_by: 'Z' },
      { lesson_id: 'l2', marked_by: 'B' },
    ], [])
    expect(out).toEqual([
      { lesson_id: 'l1', teacher_person_id: 'T', marks: 2 },
      { lesson_id: 'l2', teacher_person_id: 'B', marks: 1 },
    ])
  })

  it('ignores rows without marked_by and cancelled lessons', () => {
    const out = attendanceMarkerFallback(
      [{ lesson_id: 'l1', marked_by: null }, { lesson_id: 'l2', marked_by: 'T' }],
      [],
      new Set(['l2']),
    )
    expect(out).toEqual([])
  })
})
