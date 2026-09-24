/**
 * «פתוח עכשיו» на карточке תלמידה — общие типы и чистые помощники для
 * GET /api/students/[id]/open-items и панели в StudentOverviewTab.
 *
 * Три источника: открытые оповещения (student_alerts), незакрытые случаи
 * отсутствия (absence_cases) и открытые задачи с меткой этой תלמידה
 * (tasks.metadata.journey_id). Данных врача/психолога здесь НЕТ намеренно.
 * Раздел, на который у смотрящего нет права, приходит пустым списком (не
 * ошибкой) — панель рисуется всегда.
 */

/** Статусы задач, которые в панель НЕ попадают (закрытые). */
export const CLOSED_TASK_STATUSES = ['completed', 'cancelled', 'declined'] as const

/** Фильтр PostgREST `.not('status', 'in', …)` для закрытых статусов задач. */
export const CLOSED_TASK_STATUSES_FILTER = `(${CLOSED_TASK_STATUSES.map(s => `"${s}"`).join(',')})`

export interface OpenAlertItem {
  id: string
  type_code: string | null
  type_name_he: string | null
  type_name_ru: string | null
  type_name_en: string | null
  severity: string
  title: string | null
  state: string
  created_at: string
}

export interface OpenAbsenceItem {
  id: string
  absence_date: string | null
  note: string | null
  status: string
  department_name: string | null
  opened_at: string
}

export interface OpenTaskItem {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  assignee_name: string | null
}

export interface StudentOpenItems {
  /** persons.id תלמידה — для ссылки на экран оповещений (?student=). */
  person_id?: string
  alerts: OpenAlertItem[]
  absence_cases: OpenAbsenceItem[]
  tasks: OpenTaskItem[]
}

export const EMPTY_OPEN_ITEMS: StudentOpenItems = { alerts: [], absence_cases: [], tasks: [] }

/** Всего открытых пунктов (для счётчика в заголовке панели). */
export function countOpenItems(d: StudentOpenItems | null | undefined): number {
  if (!d) return 0
  return (d.alerts?.length ?? 0) + (d.absence_cases?.length ?? 0) + (d.tasks?.length ?? 0)
}

/** Задача открыта для панели «פתוח עכשיו» (не выполнена / не отменена / не отклонена). */
export function isOpenForPanel(status: string): boolean {
  return !(CLOSED_TASK_STATUSES as readonly string[]).includes(status)
}
