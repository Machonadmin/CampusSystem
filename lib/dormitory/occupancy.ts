// ─── Занятость комнат общежития — чистая логика ──────────────────────────────
//
// Даты — ISO 'YYYY-MM-DD'; сравниваются лексикографически (для этого формата
// это корректно и совпадает с хронологическим порядком). Открытая дата 'to'
// (null) трактуется как +бесконечность. Никаких обращений к БД — только
// расчёты, поэтому логика легко покрывается юнит-тестами.

export interface Assignment {
  assigned_from: string
  assigned_to: string | null
  status: string
}

/** Сентинел «открытого конца» диапазона (позже любой реальной ISO-даты). */
const OPEN_ENDED = '9999-12-31'

/** Активно ли назначение на дату dateISO. */
export function isActiveOn(a: Assignment, dateISO: string): boolean {
  return (
    a.status === 'active' &&
    a.assigned_from <= dateISO &&
    (a.assigned_to === null || a.assigned_to >= dateISO)
  )
}

/**
 * Пересекаются ли два диапазона дат. null 'to' — открытый конец
 * (+бесконечность). Пересечение: aFrom <= bTo && bFrom <= aTo.
 */
export function rangesOverlap(
  aFrom: string, aTo: string | null,
  bFrom: string, bTo: string | null,
): boolean {
  return aFrom <= (bTo ?? OPEN_ENDED) && bFrom <= (aTo ?? OPEN_ENDED)
}

export interface Occupancy {
  capacity: number
  occupied: number
  free: number
  isFull: boolean
}

/** Занятость комнаты на дату dateISO по списку её назначений. */
export function occupancy(
  assignments: Assignment[], capacity: number, dateISO: string,
): Occupancy {
  const occupied = assignments.filter(a => isActiveOn(a, dateISO)).length
  const free = Math.max(0, capacity - occupied)
  return { capacity, occupied, free, isFull: occupied >= capacity }
}

export interface CanAssignInput {
  roomCapacity: number
  existingActiveOverlapping: number
  studentHasActiveOverlap: boolean
}
export type CanAssignReason = 'room_full' | 'student_double_booked'
export interface CanAssignResult {
  ok: boolean
  reason?: CanAssignReason
}

/**
 * Можно ли назначить студента в комнату на диапазон дат.
 * Отказ, если:
 *   • пересекающихся активных назначений уже >= вместимости — room_full;
 *   • у студента уже есть активное назначение, пересекающееся по датам —
 *     student_double_booked.
 */
export function canAssign(input: CanAssignInput): CanAssignResult {
  if (input.existingActiveOverlapping >= input.roomCapacity) {
    return { ok: false, reason: 'room_full' }
  }
  if (input.studentHasActiveOverlap) {
    return { ok: false, reason: 'student_double_booked' }
  }
  return { ok: true }
}
