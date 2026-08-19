// ─── Обнаружение конфликтов расписания ───────────────────────────────────────
//
// По слотам расписания (class_schedule_slots) находит накладки в один день с
// пересечением по времени, где совпадает УЧИТЕЛЬ или КОМНАТА. Чистая функция —
// вход/выход только данные, чтобы легко тестировать.

export interface SlotForConflict {
  id: string
  day_of_week: number          // ISO 1..7
  start_time: string           // 'HH:MM[:SS]'
  end_time: string
  room: string | null
  teacher_ids: string[]
}

export interface ScheduleConflict {
  kind: 'teacher' | 'room'
  key: string                  // teacher_id или название комнаты
  slot_a: string
  slot_b: string
  day_of_week: number
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Пересекаются ли интервалы [start,end) двух слотов (в один день). */
function overlaps(a: SlotForConflict, b: SlotForConflict): boolean {
  return toMin(a.start_time) < toMin(b.end_time) && toMin(b.start_time) < toMin(a.end_time)
}

export function detectScheduleConflicts(slots: SlotForConflict[]): ScheduleConflict[] {
  const out: ScheduleConflict[] = []
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j]
      if (a.day_of_week !== b.day_of_week) continue
      if (!overlaps(a, b)) continue
      // Один и тот же учитель в двух местах одновременно.
      for (const tid of a.teacher_ids) {
        if (b.teacher_ids.includes(tid)) {
          out.push({ kind: 'teacher', key: tid, slot_a: a.id, slot_b: b.id, day_of_week: a.day_of_week })
        }
      }
      // Одна и та же комната.
      if (a.room && b.room && a.room.trim() && a.room.trim() === b.room.trim()) {
        out.push({ kind: 'room', key: a.room.trim(), slot_a: a.id, slot_b: b.id, day_of_week: a.day_of_week })
      }
    }
  }
  return out
}

/** Множество id слотов, участвующих хотя бы в одном конфликте. */
export function conflictedSlotIds(conflicts: ScheduleConflict[]): Set<string> {
  const s = new Set<string>()
  for (const c of conflicts) { s.add(c.slot_a); s.add(c.slot_b) }
  return s
}
