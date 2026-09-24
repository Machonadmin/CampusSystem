/**
 * Формирование записи хавруты для конкретного зрителя.
 *
 * КРИТИЧЕСКИЙ ИНВАРИАНТ ПРИВАТНОСТИ: `private_notes` (личные заметки моры)
 * отдаются ТОЛЬКО сотрудникам (isStaff=true) и НИКОГДА ученице. Публичные
 * поля (дата, имя моры, «что учили») видят все. Чистая функция — под тестом.
 */
export interface ChavrutaRow {
  id: string
  entry_date: string | null
  teacher_name: string
  summary: string | null
  private_notes?: string | null
}

export interface ChavrutaSessionView {
  id: string
  entry_date: string | null
  teacher_name: string
  summary: string | null
  private_notes?: string | null
}

export function shapeChavrutaSessionForViewer(row: ChavrutaRow, opts: { isStaff: boolean }): ChavrutaSessionView {
  const base: ChavrutaSessionView = {
    id: row.id,
    entry_date: row.entry_date,
    teacher_name: row.teacher_name,
    summary: row.summary,
  }
  // Личные заметки — только сотрудникам. Ученице ключ вообще не появляется.
  if (opts.isStaff) base.private_notes = row.private_notes ?? null
  return base
}
