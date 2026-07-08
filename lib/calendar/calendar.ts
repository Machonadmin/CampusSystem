// ─── Календарь: чистая логика (сетка месяца, пересечения, выборки) ───────────
//
// Никаких обращений к БД и НИКАКИХ вызовов Date.now(): опорные даты («сегодня»,
// границы) всегда передаются параметром, поэтому логика детерминирована и
// целиком покрывается юнит-тестами (calendar.test.ts, vitest).
//
// Два вида дат:
//   • Календарные даты дня — ISO 'YYYY-MM-DD'. Сравниваются лексикографически
//     (для этого формата совпадает с хронологическим порядком).
//   • Времена встреч — ISO-таймстемпы (starts_at/ends_at). Пересечение считается
//     по абсолютному моменту через Date.parse (учёт TZ-суффикса, если задан).

// ─────────────────────────────────────────────
// Сетка месяца
// ─────────────────────────────────────────────

export interface DayCell {
  /** ISO-дата дня 'YYYY-MM-DD'. */
  dateISO: string
  /** Принадлежит ли день запрошенному месяцу (false — ведущие/замыкающие дни). */
  inMonth: boolean
}

/** Двузначная левая паддинг-строка для номера месяца/дня. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** Собирает ISO-дату 'YYYY-MM-DD' из компонентов (месяц/день 1-based). */
export function toISODate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** Число дней в месяце (month 1-12), с учётом високосного февраля. */
export function daysInMonth(year: number, month: number): number {
  // Date(year, month, 0) в UTC → последний день предыдущего (1-based) месяца.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** День недели 1-го числа месяца: 0 = воскресенье … 6 = суббота. */
function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
}

/**
 * Сетка месяца: массив недель, каждая — 7 ячеек DayCell. Неделя начинается с
 * дня weekStartsOn (0 = воскресенье по умолчанию, 1 = понедельник). Сетка
 * дополняется ведущими днями предыдущего и замыкающими днями следующего месяца
 * так, чтобы получились полные недели.
 *
 * month — 1-12. Чистая: никаких Date.now.
 */
export function monthGrid(
  year: number,
  month: number,
  weekStartsOn: 0 | 1 = 0,
): DayCell[][] {
  const total = daysInMonth(year, month)
  const firstDow = firstWeekday(year, month)

  // Сколько ведущих дней предыдущего месяца показать в первой неделе.
  const lead = (firstDow - weekStartsOn + 7) % 7

  const cells: DayCell[] = []

  // Ведущие дни предыдущего месяца.
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const prevTotal = daysInMonth(prevYear, prevMonth)
  for (let i = lead - 1; i >= 0; i--) {
    cells.push({ dateISO: toISODate(prevYear, prevMonth, prevTotal - i), inMonth: false })
  }

  // Дни текущего месяца.
  for (let d = 1; d <= total; d++) {
    cells.push({ dateISO: toISODate(year, month, d), inMonth: true })
  }

  // Замыкающие дни следующего месяца — добить до кратного 7.
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const trail = (7 - (cells.length % 7)) % 7
  for (let d = 1; d <= trail; d++) {
    cells.push({ dateISO: toISODate(nextYear, nextMonth, d), inMonth: false })
  }

  // Нарезать по неделям.
  const weeks: DayCell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return weeks
}

// ─────────────────────────────────────────────
// Пересечение интервалов (защита от двойного бронирования)
// ─────────────────────────────────────────────

/**
 * Пересекаются ли два интервала времени [aStart, aEnd) и [bStart, bEnd).
 * Полуоткрытые интервалы: касание границами (aEnd == bStart) — НЕ пересечение.
 * Пустые/вырожденные интервалы (start >= end) пересечениями не считаются.
 * Даты — ISO-таймстемпы, сравнение по абсолютному моменту (Date.parse).
 */
export function rangesOverlap(
  aStartISO: string,
  aEndISO: string,
  bStartISO: string,
  bEndISO: string,
): boolean {
  const aStart = Date.parse(aStartISO)
  const aEnd = Date.parse(aEndISO)
  const bStart = Date.parse(bStartISO)
  const bEnd = Date.parse(bEndISO)
  if ([aStart, aEnd, bStart, bEnd].some(Number.isNaN)) return false
  if (aStart >= aEnd || bStart >= bEnd) return false
  return aStart < bEnd && bStart < aEnd
}

// ─────────────────────────────────────────────
// Выборки по дню
// ─────────────────────────────────────────────

export interface AppointmentLike {
  starts_at: string
}

/** Календарный день ISO 'YYYY-MM-DD', на который приходится момент starts_at. */
function dayOf(startsAt: string): string {
  // Берём локальную дату таймстемпа. Для 'YYYY-MM-DDTHH:mm' без TZ это первые
  // 10 символов; для полного ISO с TZ отдаём вычисленную дату.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(startsAt)
  return m ? m[1] : startsAt.slice(0, 10)
}

/**
 * Встречи, чьё начало (starts_at) приходится на календарный день dateISO.
 * Сохраняет исходный порядок массива.
 */
export function appointmentsForDay<T extends AppointmentLike>(
  appointments: T[],
  dateISO: string,
): T[] {
  return appointments.filter(a => dayOf(a.starts_at) === dateISO)
}

export interface BlockLike {
  block_date: string
}

/** Отмечен ли день dateISO как выходной (есть блок с таким block_date). */
export function isBlocked(blocks: BlockLike[], dateISO: string): boolean {
  return blocks.some(b => b.block_date === dateISO)
}

// ─────────────────────────────────────────────
// Длительность
// ─────────────────────────────────────────────

/**
 * Длительность интервала в минутах (для отображения). Округляется до целого.
 * Если границы неразбираемы — 0. Отрицательные значения не отсекаются
 * специально (валидация ends_at > starts_at живёт в API), но при корректном
 * вводе всегда положительны.
 */
export function minutesBetween(startISO: string, endISO: string): number {
  const start = Date.parse(startISO)
  const end = Date.parse(endISO)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.round((end - start) / 60000)
}
