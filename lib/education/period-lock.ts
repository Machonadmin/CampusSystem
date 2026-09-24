/**
 * Период (год + опциональный семестр/терм) и блокировка «только чтение» для
 * ПРОШЕДШИХ периодов (spec §4.11).
 *
 * ⚠ ОТКРЫТЫЙ ВОПРОС (spec §6 / §4.11): в БД НЕТ таблицы academic_years и НЕТ
 * хранимого «текущего года» (rollover заморожен). Поэтому «какой период
 * текущий» определяется провизорно — по порядку известных периодов (последний =
 * текущий). Полное серверное принуждение к read-only ждёт решения владельца о
 * точном определении «текущего периода». Эти функции ЧИСТЫЕ и определение-
 * агностичные: им передают уже упорядоченный список ключей.
 */

export interface Period {
  yearLabel: string
  term?: number | null
}

/** Стабильный строковый ключ периода. */
export function periodKey(p: Period): string {
  return `${p.yearLabel}#${p.term ?? ''}`
}

export function samePeriod(a: Period, b: Period): boolean {
  return periodKey(a) === periodKey(b)
}

/**
 * Прошедший ли `selected` относительно `current`, если известен
 * хронологический порядок ключей (oldest→newest). Неизвестные ключи и
 * отсутствие current → не прошедший (fail-open к редактированию — блокируем
 * только когда точно знаем, что период раньше текущего).
 */
export function isPastPeriod(orderedKeys: string[], currentKey: string | null, selectedKey: string): boolean {
  if (!currentKey) return false
  const ci = orderedKeys.indexOf(currentKey)
  const si = orderedKeys.indexOf(selectedKey)
  if (ci < 0 || si < 0) return false
  return si < ci
}

/**
 * Итоговое решение «только чтение»: период прошедший ИЛИ явно помечен закрытым.
 */
export function resolveReadOnly(
  orderedKeys: string[],
  currentKey: string | null,
  selectedKey: string | null,
  opts?: { closedKeys?: string[] },
): boolean {
  if (!selectedKey) return false
  if (opts?.closedKeys?.includes(selectedKey)) return true
  return isPastPeriod(orderedKeys, currentKey, selectedKey)
}

// ─── Date-based model (spec §4.11, architect decision) ───────────────────────
// Текущий период = семестр, чей диапазон дат СОДЕРЖИТ сегодня (или явно активный).
// Любой семестр, чья дата окончания ПРОШЛА, — только чтение.

export interface DatedPeriod {
  key: string
  start: string | null // ISO date
  end: string | null   // ISO date
}

/** Прошедший ли период: дата окончания строго меньше сегодня. */
export function isPeriodPast(end: string | null, todayISO: string): boolean {
  return end != null && end < todayISO
}

/** Содержит ли диапазон периода сегодняшний день (null-границы = открыты). */
export function periodContainsToday(p: DatedPeriod, todayISO: string): boolean {
  const afterStart = p.start == null || p.start <= todayISO
  const beforeEnd = p.end == null || p.end >= todayISO
  return afterStart && beforeEnd
}

/**
 * Ключ текущего периода: тот, чей диапазон содержит сегодня (при нескольких —
 * с самым поздним началом). Если ни один не содержит сегодня — самый поздний по
 * дате окончания (fallback). null — если периодов нет.
 */
export function currentPeriodKey(periods: DatedPeriod[], todayISO: string): string | null {
  if (periods.length === 0) return null
  const containing = periods.filter(p => periodContainsToday(p, todayISO))
  const pool = containing.length > 0 ? containing : periods
  const pick = containing.length > 0
    ? (a: DatedPeriod, b: DatedPeriod) => (a.start ?? '') >= (b.start ?? '') ? a : b   // latest start
    : (a: DatedPeriod, b: DatedPeriod) => (a.end ?? a.start ?? '') >= (b.end ?? b.start ?? '') ? a : b // latest end
  return pool.reduce((best, p) => (best ? pick(best, p) : p), null as DatedPeriod | null)?.key ?? null
}
