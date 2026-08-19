import { describe, it, expect } from 'vitest'
import { detectScheduleConflicts, conflictedSlotIds, type SlotForConflict } from './schedule-conflicts'

const base = (over: Partial<SlotForConflict>): SlotForConflict => ({
  id: 'x', day_of_week: 1, start_time: '09:00', end_time: '10:00', room: null, teacher_ids: [], ...over,
})

describe('detectScheduleConflicts', () => {
  it('нет слотов — нет конфликтов', () => {
    expect(detectScheduleConflicts([])).toEqual([])
  })

  it('один учитель в пересекающихся слотах одного дня → конфликт', () => {
    const s = [
      base({ id: 'a', teacher_ids: ['t1'] }),
      base({ id: 'b', start_time: '09:30', end_time: '10:30', teacher_ids: ['t1'] }),
    ]
    const c = detectScheduleConflicts(s)
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'teacher', key: 't1', slot_a: 'a', slot_b: 'b' })
  })

  it('разные дни — не конфликт', () => {
    const s = [
      base({ id: 'a', teacher_ids: ['t1'] }),
      base({ id: 'b', day_of_week: 2, teacher_ids: ['t1'] }),
    ]
    expect(detectScheduleConflicts(s)).toEqual([])
  })

  it('не пересекаются по времени — не конфликт', () => {
    const s = [
      base({ id: 'a', end_time: '10:00', teacher_ids: ['t1'] }),
      base({ id: 'b', start_time: '10:00', end_time: '11:00', teacher_ids: ['t1'] }),
    ]
    expect(detectScheduleConflicts(s)).toEqual([])
  })

  it('одна комната в пересекающихся слотах → конфликт комнаты', () => {
    const s = [
      base({ id: 'a', room: 'A1' }),
      base({ id: 'b', start_time: '09:30', end_time: '10:30', room: 'A1' }),
    ]
    const c = detectScheduleConflicts(s)
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'room', key: 'A1' })
  })

  it('и учитель, и комната совпали → два конфликта', () => {
    const s = [
      base({ id: 'a', room: 'A1', teacher_ids: ['t1'] }),
      base({ id: 'b', start_time: '09:30', end_time: '10:30', room: 'A1', teacher_ids: ['t1'] }),
    ]
    const c = detectScheduleConflicts(s)
    expect(c).toHaveLength(2)
  })

  it('conflictedSlotIds собирает id из всех конфликтов', () => {
    const s = [
      base({ id: 'a', teacher_ids: ['t1'] }),
      base({ id: 'b', start_time: '09:30', end_time: '10:30', teacher_ids: ['t1'] }),
    ]
    expect([...conflictedSlotIds(detectScheduleConflicts(s))].sort()).toEqual(['a', 'b'])
  })
})
