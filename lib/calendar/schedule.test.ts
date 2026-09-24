import { describe, it, expect } from 'vitest'
import {
  expandScheduleSlots,
  suppressCoveredInstances,
  type ScheduleSlot,
  type ScheduleInstance,
} from './schedule'

// ─────────────────────────────────────────────
// Хелпер: слот с минимумом обязательных полей
// ─────────────────────────────────────────────

function slot(partial: Partial<ScheduleSlot> & { id: string; day_of_week: number }): ScheduleSlot {
  return {
    class_group_id: 'g1',
    start_time: '10:00:00',
    end_time: '11:00:00',
    room: null,
    class_group_name: 'Группа 1',
    subject_name: 'Математика',
    subject_name_he: null,
    ...partial,
  }
}

// ─────────────────────────────────────────────
// expandScheduleSlots
// ─────────────────────────────────────────────

describe('expandScheduleSlots', () => {
  it('разворачивает недельный слот на каждое совпадение дня недели в диапазоне', () => {
    // 2026-07-06 — понедельник (ISO 1). Диапазон Пн..Пн+14 = 3 понедельника.
    const s = [slot({ id: 's1', day_of_week: 1 })]
    const r = expandScheduleSlots(s, '2026-07-06', '2026-07-20')
    expect(r.map(i => i.dateISO)).toEqual(['2026-07-06', '2026-07-13', '2026-07-20'])
    expect(r.every(i => i.slot_id === 's1')).toBe(true)
  })

  it('ISO-маппинг: 7 = воскресенье', () => {
    // 2026-07-05 — воскресенье (ISO 7).
    const s = [slot({ id: 's7', day_of_week: 7 })]
    const r = expandScheduleSlots(s, '2026-07-01', '2026-07-12')
    expect(r.map(i => i.dateISO)).toEqual(['2026-07-05', '2026-07-12'])
  })

  it('диапазон включителен с обоих концов', () => {
    // Вторник 2026-07-07 как единственный день диапазона.
    const s = [slot({ id: 's2', day_of_week: 2 })]
    const r = expandScheduleSlots(s, '2026-07-07', '2026-07-07')
    expect(r).toHaveLength(1)
    expect(r[0].dateISO).toBe('2026-07-07')
  })

  it('переносит все поля слота в экземпляр', () => {
    const s = [slot({ id: 's1', day_of_week: 2, room: 'A-101', subject_name_he: 'מתמטיקה' })]
    const r = expandScheduleSlots(s, '2026-07-07', '2026-07-07')
    expect(r[0]).toMatchObject({
      slot_id: 's1',
      class_group_id: 'g1',
      dateISO: '2026-07-07',
      start_time: '10:00:00',
      end_time: '11:00:00',
      room: 'A-101',
      class_group_name: 'Группа 1',
      subject_name: 'Математика',
      subject_name_he: 'מתמטיקה',
    })
  })

  it('несколько слотов в один день сохраняют исходный порядок', () => {
    const s = [
      slot({ id: 'b', day_of_week: 2, start_time: '12:00:00' }),
      slot({ id: 'a', day_of_week: 2, start_time: '08:00:00' }),
    ]
    const r = expandScheduleSlots(s, '2026-07-07', '2026-07-07')
    expect(r.map(i => i.slot_id)).toEqual(['b', 'a'])
  })

  it('нет совпадений дня недели → пусто', () => {
    const s = [slot({ id: 's3', day_of_week: 3 })] // среда
    // 2026-07-07 (вт) .. 2026-07-08 (ср)? 08 — среда → совпадение есть, берём Пн..Вт.
    const r = expandScheduleSlots(s, '2026-07-06', '2026-07-07')
    expect(r).toEqual([])
  })

  it('пустой список слотов → пусто', () => {
    expect(expandScheduleSlots([], '2026-07-06', '2026-07-20')).toEqual([])
  })

  it('некорректные границы → пусто', () => {
    const s = [slot({ id: 's1', day_of_week: 1 })]
    expect(expandScheduleSlots(s, 'nope', '2026-07-20')).toEqual([])
    expect(expandScheduleSlots(s, '2026-07-20', '2026-07-06')).toEqual([]) // from > to
    expect(expandScheduleSlots(s, '2026-02-31', '2026-07-06')).toEqual([]) // несуществующая
  })

  it('DST-безопасно: шаг ровно в сутки через переход времени (UTC)', () => {
    // Конец марта — в ряде TZ переход на летнее время. Через UTC-хелперы шаг
    // остаётся ровно суточным; проверяем непрерывность понедельников.
    const s = [slot({ id: 's1', day_of_week: 1 })]
    const r = expandScheduleSlots(s, '2026-03-23', '2026-04-06') // Пн 23, 30, Пн 6
    expect(r.map(i => i.dateISO)).toEqual(['2026-03-23', '2026-03-30', '2026-04-06'])
  })
})

// ─────────────────────────────────────────────
// suppressCoveredInstances
// ─────────────────────────────────────────────

describe('suppressCoveredInstances', () => {
  const instances: ScheduleInstance[] = [
    { slot_id: 's1', class_group_id: 'g1', dateISO: '2026-07-06', start_time: '10:00:00', end_time: '11:00:00', room: null, class_group_name: 'Г1', subject_name: 'М', subject_name_he: null },
    { slot_id: 's1', class_group_id: 'g1', dateISO: '2026-07-13', start_time: '10:00:00', end_time: '11:00:00', room: null, class_group_name: 'Г1', subject_name: 'М', subject_name_he: null },
  ]

  it('прячет экземпляр, перекрытый реальным уроком (группа+дата+время)', () => {
    const lessons = [{ class_group_id: 'g1', date: '2026-07-06', time: '10:00:00' }]
    const r = suppressCoveredInstances(instances, lessons)
    expect(r.map(i => i.dateISO)).toEqual(['2026-07-13'])
  })

  it('сравнивает время по HH:mm (учитывает секунды у урока и слота)', () => {
    const lessons = [{ class_group_id: 'g1', date: '2026-07-06', time: '10:00' }]
    const r = suppressCoveredInstances(instances, lessons)
    expect(r.map(i => i.dateISO)).toEqual(['2026-07-13'])
  })

  it('другое время урока НЕ подавляет слот', () => {
    const lessons = [{ class_group_id: 'g1', date: '2026-07-06', time: '12:00:00' }]
    const r = suppressCoveredInstances(instances, lessons)
    expect(r).toHaveLength(2)
  })

  it('другая группа НЕ подавляет слот', () => {
    const lessons = [{ class_group_id: 'g2', date: '2026-07-06', time: '10:00:00' }]
    const r = suppressCoveredInstances(instances, lessons)
    expect(r).toHaveLength(2)
  })

  it('урок без времени (null) ничего не подавляет', () => {
    const lessons = [{ class_group_id: 'g1', date: '2026-07-06', time: null }]
    const r = suppressCoveredInstances(instances, lessons)
    expect(r).toHaveLength(2)
  })

  it('пустой список уроков → все экземпляры остаются', () => {
    expect(suppressCoveredInstances(instances, [])).toHaveLength(2)
  })

  it('сохраняет исходный порядок оставшихся', () => {
    const three: ScheduleInstance[] = [
      { ...instances[0], dateISO: '2026-07-06' },
      { ...instances[0], dateISO: '2026-07-13' },
      { ...instances[0], dateISO: '2026-07-20' },
    ]
    const lessons = [{ class_group_id: 'g1', date: '2026-07-13', time: '10:00:00' }]
    const r = suppressCoveredInstances(three, lessons)
    expect(r.map(i => i.dateISO)).toEqual(['2026-07-06', '2026-07-20'])
  })
})
