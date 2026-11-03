import type { CourseResultStatus } from '@/types/database'

/**
 * מצב בקורס + מטלות להגשה — чистая логика (без БД), общая для API и UI.
 */

export const COURSE_RESULT_STATUSES: readonly CourseResultStatus[] = [
  'in_progress', 'passed', 'failed', 'incomplete', 'withdrawn',
] as const

export function isCourseResultStatus(v: unknown): v is CourseResultStatus {
  return typeof v === 'string' && (COURSE_RESULT_STATUSES as readonly string[]).includes(v)
}

/** ציון סופי: null или число 0..100 (до двух знаков). */
export function isValidFinalGrade(v: unknown): v is number | null {
  if (v === null) return true
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100
}

/**
 * Средний процент по выставленным оценкам курса: каждая оценка приводится к
 * 0..100 через max_score и усредняется без весов. null — оценок нет.
 */
export function averagePercent(items: Array<{ score: number | null; max_score: number }>): number | null {
  const valid = items.filter(i => i.score !== null && i.max_score > 0)
  if (valid.length === 0) return null
  const sum = valid.reduce((acc, i) => acc + (Number(i.score) / Number(i.max_score)) * 100, 0)
  return Math.round((sum / valid.length) * 10) / 10
}

export type SubmissionState = 'submitted' | 'late' | 'missing' | 'open'

/**
 * Состояние сдачи мטלה для ученицы на дату todayISO:
 *   submitted — сдано в срок (или срока нет), late — сдано после срока,
 *   missing — не сдано и срок прошёл, open — не сдано, срок ещё не прошёл.
 * Срок — конец дня dueISO (по дате, без часов).
 */
export function submissionState(
  dueISO: string | null,
  submittedAtISO: string | null,
  todayISO: string,
): SubmissionState {
  if (submittedAtISO) {
    if (!dueISO) return 'submitted'
    return submittedAtISO.slice(0, 10) > dueISO ? 'late' : 'submitted'
  }
  if (dueISO && todayISO > dueISO) return 'missing'
  return 'open'
}
