// ─── Расписание: разворот повторяющихся слотов в конкретные дни ──────────────
//
// Чистая логика (без БД и без Date.now): слот расписания — это ПОВТОРЯЮЩЕЕСЯ
// правило («каждый понедельник 10:00, ауд. A»), у него нет даты. Здесь мы
// разворачиваем такие слоты в конкретные экземпляры для диапазона дат и
// подавляем те из них, что уже перекрыты реальным уроком.
//
// Даты считаем через UTC-хелперы schedule-dates (DST-безопасно): день недели
// по ISO (1=Пн..7=Вс), шаг ровно в MS_PER_DAY.

import { parseDateUTC, fmtDateUTC, isoWeekday, MS_PER_DAY } from '@/lib/education/schedule-dates'
import { toHHmm } from './calendar'

/** Слот расписания группы (повторяющееся правило, без даты). */
export interface ScheduleSlot {
  id: string
  class_group_id: string
  /** ISO день недели: 1=Пн .. 7=Вс. */
  day_of_week: number
  start_time: string
  end_time: string
  room: string | null
  class_group_name: string
  subject_name: string
  subject_name_he: string | null
}

/** Конкретный экземпляр слота на дату dateISO. */
export interface ScheduleInstance {
  slot_id: string
  class_group_id: string
  dateISO: string
  start_time: string
  end_time: string
  room: string | null
  class_group_name: string
  subject_name: string
  subject_name_he: string | null
}

/**
 * Разворачивает слоты в конкретные экземпляры на каждый подходящий день недели
 * в диапазоне [fromISO, toISO] (ВКЛЮЧИТЕЛЬНО с обоих концов). Порядок: по дням
 * возрастанию, внутри дня — в исходном порядке слотов. Некорректные границы
 * (неразбираемая дата или from > to) → []. Чистая: без Date.now.
 */
export function expandScheduleSlots(
  slots: ScheduleSlot[],
  fromISO: string,
  toISO: string,
): ScheduleInstance[] {
  const fromMs = parseDateUTC(fromISO)
  const toMs = parseDateUTC(toISO)
  if (fromMs === null || toMs === null || fromMs > toMs) return []

  const out: ScheduleInstance[] = []
  for (let ms = fromMs; ms <= toMs; ms += MS_PER_DAY) {
    const wd = isoWeekday(ms)
    const dateISO = fmtDateUTC(ms)
    for (const s of slots) {
      if (s.day_of_week !== wd) continue
      out.push({
        slot_id: s.id,
        class_group_id: s.class_group_id,
        dateISO,
        start_time: s.start_time,
        end_time: s.end_time,
        room: s.room,
        class_group_name: s.class_group_name,
        subject_name: s.subject_name,
        subject_name_he: s.subject_name_he,
      })
    }
  }
  return out
}

/** Ключ реального урока для подавления шаблонных экземпляров. */
export interface LessonKey {
  class_group_id: string
  /** scheduled_date 'YYYY-MM-DD'. */
  date: string
  /** scheduled_time 'HH:mm[:ss]' или null. */
  time: string | null
}

/** Ключ совпадения (группа|дата|HH:mm) для сравнения слота и урока. */
function coverKey(classGroupId: string, dateISO: string, time: string | null): string {
  return `${classGroupId}|${dateISO}|${toHHmm(time)}`
}

/**
 * Убирает экземпляры слотов, перекрытые реальным уроком той же группы, даты и
 * времени начала (class_group_id + dateISO + start_time == scheduled_time).
 * Реальный урок «побеждает» шаблон. Урок без времени (time=null) шаблон НЕ
 * подавляет (не совпадёт по HH:mm). Порядок сохраняется. Чистая.
 */
export function suppressCoveredInstances(
  instances: ScheduleInstance[],
  lessons: LessonKey[],
): ScheduleInstance[] {
  const covered = new Set<string>()
  for (const l of lessons) {
    const hhmm = toHHmm(l.time)
    // Урок без разбираемого времени не перекрывает конкретный слот.
    if (!hhmm) continue
    covered.add(coverKey(l.class_group_id, l.date, l.time))
  }
  return instances.filter(
    i => !covered.has(coverKey(i.class_group_id, i.dateISO, i.start_time)),
  )
}
