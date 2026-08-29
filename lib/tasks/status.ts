import type { TaskStatus } from '@/types/database'

/**
 * ЕДИНАЯ модель статусов задач (запрос владельца: «должно быть ясно, выполнена
 * задача или нет, без лишних опций»).
 *
 * В БД остаются все 7 исторических значений (TEXT + CHECK, миграция не нужна),
 * но ПОЛЬЗОВАТЕЛЬ видит три состояния:
 *   открыта   ⇐ unassigned | pending | in_progress | review | declined
 *   выполнена ⇐ completed
 *   отменена  ⇐ cancelled
 *
 * review/declined из UI больше не создаются (кнопок нет), легаси-строки
 * продолжают отображаться и получают выход («בוצע»/«פתיחה מחדש»).
 * Раньше эти списки были рассыпаны по 6 файлам и расходились (active-stages
 * недосчитывал review/declined) — теперь один источник.
 */

/** Задача ещё НЕ закрыта (видна как «открыта», считается в счётчиках). */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = [
  'unassigned', 'pending', 'in_progress', 'review', 'declined',
] as const

/** Терминальные статусы (закрыта: выполнена или отменена). */
export const CLOSED_TASK_STATUSES: readonly TaskStatus[] = ['completed', 'cancelled'] as const

export function isOpenTaskStatus(status: string): boolean {
  return (OPEN_TASK_STATUSES as readonly string[]).includes(status)
}

/** Упрощённое состояние для UI: open / done / cancelled. */
export type SimpleTaskState = 'open' | 'done' | 'cancelled'
export function simplifyTaskStatus(status: TaskStatus): SimpleTaskState {
  if (status === 'completed') return 'done'
  if (status === 'cancelled') return 'cancelled'
  return 'open'
}
