// ─── Разделы списка задач (?view=) ───────────────────────────────────────────
//
// Решение владельца 2026-10-12: по умолчанию показываются ВСЕ задачи человека,
// по какой бы причине они к нему ни попали, а дальше он сужает список
// фильтром: созданные для него, личные (созданные им), всего отдела, в
// наблюдении. «Все» = объединение этих четырёх источников без повторов.

export const TASK_SOURCES = ['assigned', 'created', 'department', 'watching'] as const
export type TaskSource = (typeof TASK_SOURCES)[number]

export const TASK_VIEWS = ['all', ...TASK_SOURCES] as const
export type TaskView = (typeof TASK_VIEWS)[number]

export function isTaskView(v: unknown): v is TaskView {
  return typeof v === 'string' && (TASK_VIEWS as readonly string[]).includes(v)
}

/**
 * Склеивает выдачи нескольких источников в один список: задача, попавшая в
 * несколько источников (например, создал сам и назначил себе), остаётся
 * одна. Порядок — как у одиночного раздела: новые сверху, при равенстве по id.
 */
export function mergeTaskLists<T extends { id: string; created_at: string }>(lists: T[][]): T[] {
  const byId = new Map<string, T>()
  for (const list of lists) for (const row of list) if (!byId.has(row.id)) byId.set(row.id, row)
  return [...byId.values()].sort((a, b) =>
    a.created_at === b.created_at
      ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      : (a.created_at < b.created_at ? 1 : -1))
}
