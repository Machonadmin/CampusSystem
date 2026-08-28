/**
 * Общие чистые date-хелперы. Раньше эти функции были продублированы
 * побайтово в *validation.ts / *-server.ts нескольких модулей — здесь
 * их единственная каноническая копия, а модули её реэкспортируют.
 *
 * Shared pure date helpers. Previously copy-pasted verbatim across several
 * modules; this is the single canonical source that those modules re-export.
 */

/** Валидная календарная дата в ISO-формате 'YYYY-MM-DD' (с проверкой round-trip). */
export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Сегодняшняя дата в ISO 'YYYY-MM-DD'. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Кол-во целых дней от todayISO до dateISO (может быть отрицательным). */
export function daysUntil(dateISO: string, todayISO: string): number {
  const target = Date.parse(`${dateISO}T00:00:00Z`)
  const today = Date.parse(`${todayISO}T00:00:00Z`)
  return Math.round((target - today) / 86_400_000)
}

/** Открытый (незакрытый) конец диапазона трактуется как «очень далеко в будущем». */
const OPEN_ENDED = '9999-12-31'

/**
 * Пересекаются ли два полуоткрытых диапазона дат [aFrom, aTo] и [bFrom, bTo],
 * где `null` в конце означает «без конца». Границы включительны.
 */
export function rangesOverlap(
  aFrom: string, aTo: string | null,
  bFrom: string, bTo: string | null,
): boolean {
  return aFrom <= (bTo ?? OPEN_ENDED) && bFrom <= (aTo ?? OPEN_ENDED)
}
