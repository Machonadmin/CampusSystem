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

/** Сентинел «открытого конца» диапазона (позже любой реальной ISO-даты). */
const OPEN_ENDED = '9999-12-31'

/** Активна ли запись на дату dateISO. */
export function isActiveOn(e: Enrollment, dateISO: string): boolean {
  return (
    e.status === 'active' &&
    e.enrolled_from <= dateISO &&
    (e.enrolled_to === null || e.enrolled_to >= dateISO)
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
