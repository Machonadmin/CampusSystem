// ─── Чистые метрики учёбы: посещаемость и оценки ─────────────────────────────
//
// Извлечено из app/api/education/journeys/[id]/report/route.ts без изменения
// поведения, чтобы покрыть юнит-тестами. Роут импортирует эти функции.

/** Округление до одного знака после запятой (как в отчёте студента). */
export function round1(x: number): number {
  return Math.round(x * 10) / 10
}

export interface AttendanceCounts {
  present: number
  late: number
  absent: number
}

/** Число размеченных уроков = сумма всех статусов. */
export function markedCount(a: AttendanceCounts): number {
  return a.present + a.late + a.absent
}

/**
 * «Баллы пропусков» по весам: absent=1, late=0.5, present=0.
 * Чем меньше — тем лучше посещаемость.
 */
export function absencePoints(a: AttendanceCounts): number {
  return round1(a.absent * 1 + a.late * 0.5)
}

/**
 * Процент посещаемости с учётом весов: опоздание стоит половину пропуска.
 * percent = (marked − (absent + 0.5·late)) / marked · 100.
 * null — если ничего не размечено. Результат — целое (Math.round).
 */
export function attendancePercent(a: AttendanceCounts): number | null {
  const marked = markedCount(a)
  if (marked === 0) return null
  const attendedWeighted = marked - absencePoints(a)
  return Math.round((attendedWeighted / marked) * 100)
}

/**
 * Средний процент по оценкам. Для каждой засчитываемой оценки процент =
 * score / max_score * 100; учитываются только записи с проставленным score и
 * max_score > 0 (деление на ноль исключено). Среднее округляется до 0.1.
 * null — если ни одной засчитываемой оценки нет.
 */
export function gradeAveragePercent(
  grades: { score: number | null; max_score: number }[],
): number | null {
  const percents: number[] = []
  for (const g of grades) {
    if (g.score !== null && g.max_score > 0) {
      percents.push((g.score / g.max_score) * 100)
    }
  }
  if (percents.length === 0) return null
  return round1(percents.reduce((s, x) => s + x, 0) / percents.length)
}
