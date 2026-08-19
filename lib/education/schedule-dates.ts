// ─── Чистые операции с датами расписания (UTC) ───────────────────────────────
//
// Извлечено из app/api/education/class-groups/[id]/schedule/generate/route.ts
// без изменения поведения, для юнит-покрытия генерации уроков из слотов.

export const MS_PER_DAY = 86400000

/** 'YYYY-MM-DD' → UTC-полночь в ms, или null (с проверкой реальности даты). */
export function parseDateUTC(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const ms = Date.UTC(y, mo - 1, d)
  const dt = new Date(ms)
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return ms
}

/** UTC ms → 'YYYY-MM-DD'. */
export function fmtDateUTC(ms: number): string {
  const dt = new Date(ms)
  const y = dt.getUTCFullYear()
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

/** ISO день недели (1=Пн..7=Вс) из UTC ms. getUTCDay(): 0=Вс..6=Сб. */
export function isoWeekday(ms: number): number {
  return ((new Date(ms).getUTCDay() + 6) % 7) + 1
}
