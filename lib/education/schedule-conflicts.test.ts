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

  it('общие ученицы в пересекающихся слотах → конфликт students', () => {
    const s = [
      base({ id: 'a', student_ids: ['s1', 's2'] }),
      base({ id: 'b', start_time: '09:30', end_time: '10:30', student_ids: ['s2', 's3'] }),
    ]
    const c = detectScheduleConflicts(s)
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'students', key: '1', slot_a: 'a', slot_b: 'b' })
  })

  it('нет общих учениц → нет конфликта students', () => {
    const s = [
      base({ id: 'a', student_ids: ['s1'] }),
      base({ id: 'b', start_time: '09:30', end_time: '10:30', student_ids: ['s2'] }),
    ]
    expect(detectScheduleConflicts(s)).toEqual([])
  })

  // ─── Преподаватель НА УРОВНЕ СЛОТА (миграция 20260915120000) ───────────────
  // Роут заполняет teacher_ids действующим значением: свой teacher_id слота,
  // иначе весь список class_teachers группы (lib/education/slot-fields).
  // Здесь фиксируем, что из этого получается в сетке.

  it('у каждого слота свой преподаватель → пересечение по времени НЕ конфликт', () => {
    // Раньше оба слота несли ВЕСЬ список преподавателей группы, и два
    // параллельных урока одной группы всегда выглядели двойным бронированием.
    const c = detectScheduleConflicts([
      base({ id: 'a', teacher_ids: ['t1'] }),
      base({ id: 'b', start_time: '09:30', end_time: '10:30', teacher_ids: ['t2'] }),
    ])
    expect(c).toEqual([])
  })

  it('один и тот же преподаватель на слотах РАЗНЫХ групп → конфликт по нему', () => {
    const c = detectScheduleConflicts([
      base({ id: 'a', teacher_ids: ['t1'] }),
      base({ id: 'b', start_time: '09:30', end_time: '10:30', teacher_ids: ['t1'] }),
    ])
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'teacher', key: 't1', slot_a: 'a', slot_b: 'b' })
  })

  it('слот со своим преподавателем против слота, унаследовавшего список группы', () => {
    // b без своего преподавателя → несёт обоих преподавателей группы, среди них t1.
    const c = detectScheduleConflicts([
      base({ id: 'a', teacher_ids: ['t1'] }),
      base({ id: 'b', start_time: '09:30', end_time: '10:30', teacher_ids: ['t1', 't2'] }),
    ])
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'teacher', key: 't1' })
  })

  it('свой преподаватель, которого нет среди преподавателей встречной группы → не конфликт', () => {
    const c = detectScheduleConflicts([
      base({ id: 'a', teacher_ids: ['t9'] }),
      base({ id: 'b', start_time: '09:30', end_time: '10:30', teacher_ids: ['t1', 't2'] }),
    ])
    expect(c).toEqual([])
  })

  it('слот без преподавателя вовсе (пустой список) ни с чем не конфликтует по преподавателю', () => {
    const c = detectScheduleConflicts([
      base({ id: 'a', teacher_ids: [] }),
      base({ id: 'b', start_time: '09:30', end_time: '10:30', teacher_ids: ['t1'] }),
    ])
    expect(c).toEqual([])
  })

  it('conflictedSlotIds собирает id из всех конфликтов', () => {
    const s = [
      base({ id: 'a', teacher_ids: ['t1'] }),
      base({ id: 'b', start_time: '09:30', end_time: '10:30', teacher_ids: ['t1'] }),
    ]
    expect([...conflictedSlotIds(detectScheduleConflicts(s))].sort()).toEqual(['a', 'b'])
  })
})
