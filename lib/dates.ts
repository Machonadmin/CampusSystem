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

/**
 * Часовой пояс учреждения. «Сегодня» в бизнес-логике = сегодня в Израиле —
 * иначе на UTC-сервере (Vercel) с полуночи до 02:00–03:00 по Израилю дата
 * съезжала бы на «вчера» (просроченность, дефолтные даты форм, активные окна).
 */
export const APP_TIME_ZONE = 'Asia/Jerusalem'

/** ISO 'YYYY-MM-DD' переданного момента в указанном поясе (по умолчанию — TZ учреждения). */
export function isoInTZ(date: Date, tz: string = APP_TIME_ZONE): string {
  // en-CA даёт формат YYYY-MM-DD; timeZone переводит инстант в местную дату.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

/** Сегодняшняя дата в ISO 'YYYY-MM-DD' по времени учреждения (Asia/Jerusalem). */
export function todayISO(): string {
  return isoInTZ(new Date())
}

/**
 * ISO 'YYYY-MM-DD' из ЛОКАЛЬНЫХ компонентов даты (getFullYear/getMonth/getDate).
 * ВНИМАНИЕ: это НЕ UTC (в отличие от todayISO()) — дата соответствует часовому
 * поясу среды. Для UI-виджетов, где граница «сегодня» должна совпадать с
 * локальными часами пользователя.
 */
export function localISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Сегодня в ISO 'YYYY-MM-DD' по ЛОКАЛЬНОМУ времени (ср. todayISO() — UTC). */
export const localTodayISO = (): string => localISODate(new Date())

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
