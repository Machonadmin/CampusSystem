const LOCALE_MAP: Record<string, string> = { ru: 'ru-RU', he: 'he-IL', en: 'en-US' }

function toIntlLocale(lang: string): string {
  return LOCALE_MAP[lang] ?? 'ru-RU'
}

/**
 * Устойчиво разбирает вход в Date. Принимает и «дату» ('YYYY-MM-DD'), и полный
 * timestamptz ('2026-07-14T12:34:56+00:00' / '2026-07-14 12:34:56+00').
 * Дату без времени якорим на локальную полночь (прежнее поведение); полный
 * штамп парсим как есть. Возвращает null для пустых/битых значений —
 * форматтеры НИКОГДА не бросают RangeError (раньше добавление 'T00:00:00' к
 * полному timestamp давало Invalid Date и роняло весь экран задачи).
 */
function parseDateInput(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const s = dateStr.trim()
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s)
  const d = new Date(isDateOnly ? s + 'T00:00:00' : s)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "15.06.2026" / "15/06/2026" / "15.06.2026" */
export function formatDate(dateStr: string, lang: string): string {
  const d = parseDateInput(dateStr)
  if (!d) return dateStr ?? ''
  return new Intl.DateTimeFormat(toIntlLocale(lang), {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d)
}

/** "15 июн" / "15 Jun" / "15 יונ" */
export function formatDateShort(dateStr: string, lang: string): string {
  const d = parseDateInput(dateStr)
  if (!d) return dateStr ?? ''
  return new Intl.DateTimeFormat(toIntlLocale(lang), {
    day: '2-digit', month: 'short',
  }).format(d)
}

/** "15 июня 2026 г." / "June 15, 2026" / "15 ביוני 2026" */
export function formatDateLong(dateStr: string, lang: string): string {
  const d = parseDateInput(dateStr)
  if (!d) return dateStr ?? ''
  return new Intl.DateTimeFormat(toIntlLocale(lang), {
    day: '2-digit', month: 'long', year: 'numeric',
  }).format(d)
}

/** "15.06.2026, 14:30" */
export function formatDateTime(dateStr: string, lang: string): string {
  const d = parseDateInput(dateStr)
  if (!d) return dateStr ?? ''
  return new Intl.DateTimeFormat(toIntlLocale(lang), {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}
