// ─── Питание: запись студента на план — чистая логика ────────────────────────
//
// Даты — ISO 'YYYY-MM-DD'; сравниваются лексикографически (для этого формата
// корректно и совпадает с хронологическим порядком). Открытая дата 'to' (null)
// трактуется как +бесконечность. Никаких обращений к БД — только расчёты,
// поэтому логика покрывается юнит-тестами. Правило модуля: у студента может
// быть только ОДНА активная запись на план питания на любом пересекающемся
// диапазоне дат.

export interface Enrollment {
  enrolled_from: string
  enrolled_to: string | null
  status: string
}

/** Активна ли запись на дату dateISO. */
export function isActiveOn(e: Enrollment, dateISO: string): boolean {
  return (
    e.status === 'active' &&
    e.enrolled_from <= dateISO &&
    (e.enrolled_to === null || e.enrolled_to >= dateISO)
  )
}

export { rangesOverlap } from '@/lib/dates'

/** Сколько записей активно на дату dateISO. */
export function activeCount(enrollments: Enrollment[], dateISO: string): number {
  return enrollments.filter(e => isActiveOn(e, dateISO)).length
}

export interface CanEnrollInput {
  studentHasActiveOverlap: boolean
}
export type CanEnrollReason = 'student_double_enrolled'
export interface CanEnrollResult {
  ok: boolean
  reason?: CanEnrollReason
}

/**
 * Можно ли записать студента на план питания на диапазон дат.
 * Отказ, если у студента уже есть активная запись, пересекающаяся по датам
 * (одна активная запись на план на пересекающемся диапазоне) —
 * student_double_enrolled.
 */
export function canEnroll(input: CanEnrollInput): CanEnrollResult {
  if (input.studentHasActiveOverlap) {
    return { ok: false, reason: 'student_double_enrolled' }
  }
  return { ok: true }
}
