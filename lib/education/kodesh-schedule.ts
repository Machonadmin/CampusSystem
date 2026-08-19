// Первые два урока каждого учебного дня зарезервированы под יהדות (кодеш).
// Значения соответствуют seed-слотам кодеш-групп (миграция kodesh_groups_seed):
// два утренних блока Пн–Чт. Используется, чтобы ПРЕДУПРЕЖДАТЬ, когда обычный
// курс ставит занятие на зарезервированное время (мягкое правило, не блок).

export const KODESH_DAYS = [1, 2, 3, 4] as const // ISO Пн–Чт
export const KODESH_WINDOWS = [
  { start: '09:15', end: '10:30' },
  { start: '11:00', end: '12:10' },
] as const

function toSec(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2]), s = m[3] ? Number(m[3]) : 0
  if (h > 23 || mi > 59 || s > 59) return null
  return h * 3600 + mi * 60 + s
}

/** Пересекается ли слот (день недели + время) с зарезервированным блоком иудаики? */
export function collidesWithKodesh(day: number, start: string, end: string): boolean {
  if (!(KODESH_DAYS as readonly number[]).includes(day)) return false
  const s = toSec(start), e = toSec(end)
  if (s === null || e === null) return false
  return KODESH_WINDOWS.some(w => {
    const ws = toSec(w.start)!, we = toSec(w.end)!
    return s < we && e > ws // пересечение интервалов
  })
}
