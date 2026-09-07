import type { JourneyStatus } from '@/types/database'

/**
 * Статусы учебного цикла в education_journeys (таблица, заменившая legacy
 * `students`). Держим их в ОДНОМ месте, чтобы подсчёты студенток не разъезжались
 * между экранами.
 */
export const STUDENT_STATUSES: ReadonlyArray<JourneyStatus> =
  ['student', 'graduated', 'expelled', 'on_leave']

/**
 * «Действующая студентка» — прямой аналог legacy `students.status='active'`:
 * та, кто СЕЙЧАС учится. graduated / expelled / on_leave активными не считаются.
 * Используется в счётчиках базовых групп и в превью scope сотрудника.
 */
export const ACTIVE_STUDENT_STATUSES: ReadonlyArray<JourneyStatus> = ['student']

/** Относится ли статус к учебному циклу (студентка/выпускница/отчислена/академ). */
export function isStudentStatus(s: string | null | undefined): boolean {
  return !!s && (STUDENT_STATUSES as readonly string[]).includes(s)
}

/** Учится ли СЕЙЧАС (счётчики «сколько активных студенток»). */
export function isActiveStudentStatus(s: string | null | undefined): boolean {
  return !!s && (ACTIVE_STUDENT_STATUSES as readonly string[]).includes(s)
}
