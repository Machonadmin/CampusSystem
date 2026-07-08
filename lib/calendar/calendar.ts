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
// Уроки преподавателя (read-only слой поверх встреч)
// ─────────────────────────────────────────────

export interface LessonLike {
  /** Календарная дата урока ISO 'YYYY-MM-DD' (scheduled_date). */
  date: string
  /** Время урока 'HH:mm' / 'HH:mm:ss' или null (scheduled_time). */
  time: string | null
}

/**
 * Уроки, приходящиеся на календарный день dateISO. Дата урока уже 'YYYY-MM-DD',
 * поэтому сравниваем напрямую. Сохраняет исходный порядок массива.
 */
export function lessonsForDay<T extends LessonLike>(lessons: T[], dateISO: string): T[] {
  return lessons.filter(l => l.date === dateISO)
}

/**
 * Нормализует время к 'HH:mm' для сортировки и показа. Принимает и «голое»
 * время ('09:00', '09:00:00'), и ISO-таймстемп ('2026-07-08T09:00:00Z') —
 * берёт первые HH:mm после начала строки либо после 'T'. '' — если времени нет
 * (null / неразбираемо / только дата).
 */
export function toHHmm(value: string | null | undefined): string {
  if (!value) return ''
  const m = /(?:^|T)(\d{2}):(\d{2})/.exec(value)
  return m ? `${m[1]}:${m[2]}` : ''
}

// ─────────────────────────────────────────────
// Задачи с дедлайном (read-only слой)
// ─────────────────────────────────────────────

export interface TaskLike {
  /** Дата дедлайна ISO 'YYYY-MM-DD' (due_date). */
  due_date: string
  /** Время дедлайна 'HH:mm[:ss]' или null (due_time). */
  due_time: string | null
  /** true — задача «на весь день», времени нет (due_all_day). */
  due_all_day: boolean
}

/**
 * Задачи, чей дедлайн (due_date) приходится на день dateISO. Дата уже
 * 'YYYY-MM-DD', сравниваем напрямую. Сохраняет исходный порядок массива.
 */
export function tasksForDay<T extends TaskLike>(tasks: T[], dateISO: string): T[] {
  return tasks.filter(t => t.due_date === dateISO)
}

// ─────────────────────────────────────────────
// Повторяющееся расписание (read-only слой)
// ─────────────────────────────────────────────

export interface ScheduleLike {
  /** Дата конкретного экземпляра слота ISO 'YYYY-MM-DD'. */
  dateISO: string
  /** Время начала 'HH:mm[:ss]' (start_time). */
  start_time: string
}

/**
 * Экземпляры расписания, приходящиеся на день dateISO. Сохраняет исходный
 * порядок массива.
 */
export function scheduleForDay<S extends ScheduleLike>(schedule: S[], dateISO: string): S[] {
  return schedule.filter(s => s.dateISO === dateISO)
}

// ─────────────────────────────────────────────
// Единая лента событий дня
// ─────────────────────────────────────────────

/** Тип события дня: встреча | урок | повторяющийся слот | задача. */
export type DayEventKind = 'appointment' | 'lesson' | 'schedule' | 'task'

/**
 * Единое событие дня. Ровно одно из appointment / lesson / schedule / task
 * непусто, kind соответствует ему. time — 'HH:mm' или '' (нет времени).
 */
export interface DayEvent<A, L, S, T> {
  kind: DayEventKind
  time: string
  appointment: A | null
  lesson: L | null
  schedule: S | null
  task: T | null
}

/**
 * Сливает встречи, уроки, повторяющиеся слоты и задачи одного дня в ЕДИНУЮ
 * ленту, отсортированную по времени (по возрастанию). События без времени ('')
 * уходят в конец — сюда же попадают «на весь день» задачи. Сортировка стабильна:
 * при равном времени сохраняется исходный порядок вставки, а порядок вставки —
 * встреча → урок → слот → задача. Чистая: без Date.now.
 */
export function mergeDayEvents<
  A extends AppointmentLike,
  L extends LessonLike,
  S extends ScheduleLike,
  T extends TaskLike,
>(
  appointments: A[],
  lessons: L[],
  schedule: S[],
  tasks: T[],
  dateISO: string,
): DayEvent<A, L, S, T>[] {
  const events: DayEvent<A, L, S, T>[] = []
  for (const a of appointmentsForDay(appointments, dateISO)) {
    events.push({ kind: 'appointment', time: toHHmm(a.starts_at), appointment: a, lesson: null, schedule: null, task: null })
  }
  for (const l of lessonsForDay(lessons, dateISO)) {
    events.push({ kind: 'lesson', time: toHHmm(l.time), appointment: null, lesson: l, schedule: null, task: null })
  }
  for (const s of scheduleForDay(schedule, dateISO)) {
    events.push({ kind: 'schedule', time: toHHmm(s.start_time), appointment: null, lesson: null, schedule: s, task: null })
  }
  for (const tk of tasksForDay(tasks, dateISO)) {
    // «На весь день» → без времени: уходит в конец ленты, как time-less урок.
    events.push({ kind: 'task', time: tk.due_all_day ? '' : toHHmm(tk.due_time), appointment: null, lesson: null, schedule: null, task: tk })
  }
  // Стабильная сортировка по времени; пустое время ('') — в конец.
  return events
    .map((e, i) => ({ e, i }))
    .sort((x, y) => {
      const kx = x.e.time || '99:99'
      const ky = y.e.time || '99:99'
      if (kx < ky) return -1
      if (kx > ky) return 1
      return x.i - y.i
    })
    .map(({ e }) => e)
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
