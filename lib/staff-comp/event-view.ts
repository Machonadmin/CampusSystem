/**
 * Формирование записи события сотрудника (шаббат-приём и т.п.) для зрителя.
 *
 * КРИТИЧЕСКИЙ ИНВАРИАНТ ПРИВАТНОСТИ: `private_notes` (личное резюме сотрудника
 * после события) отдаются ТОЛЬКО тем, кому можно (менеджер / автор), и НИКОГДА
 * ученице. Публичные поля (дата, кто принимал, тип, что было) — всем. Чистая
 * функция под тестом — тот же инвариант, что у хавруты.
 */
export interface EventRow {
  id: string
  entry_date: string | null
  entry_type: string
  host_name: string
  summary: string | null
  private_notes?: string | null
}

export interface EventView {
  id: string
  entry_date: string | null
  entry_type: string
  host_name: string
  summary: string | null
  private_notes?: string | null
}

export function shapeEventForViewer(row: EventRow, opts: { canSeePrivate: boolean }): EventView {
  const base: EventView = {
    id: row.id,
    entry_date: row.entry_date,
    entry_type: row.entry_type,
    host_name: row.host_name,
    summary: row.summary,
  }
  if (opts.canSeePrivate) base.private_notes = row.private_notes ?? null
  return base
}
