// ─── Еврейские даты: чистое форматирование через встроенный Intl ─────────────
//
// Никаких внешних библиотек: используем встроенный в Node/браузер календарь
// 'he-u-ca-hebrew'. Все функции ЧИСТЫЕ — принимают ISO-строку дня 'YYYY-MM-DD',
// парсят её как UTC-полночь (timeZone: 'UTC'), поэтому результат не зависит от
// таймзоны машины и целиком покрывается юнит-тестами.
//
// ВНИМАНИЕ: конкретный ТЕКСТ (названия месяцев, форма цифр) зависит от версии
// ICU и может отличаться между окружениями. Тесты проверяют СТРУКТУРУ
// (непустые части, наличие названия месяца), а не точные строки.

/** Парсит 'YYYY-MM-DD' в UTC-полночь. null — если формат неверный. */
function parseISODate(dateISO: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return Number.isNaN(dt.getTime()) ? null : dt
}

/** Общий форматтер еврейского календаря (day/month/year). */
function hebrewFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('he-u-ca-hebrew', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export interface HebrewDateParts {
  /** День месяца (еврейские/арабские цифры — как отдаёт ICU). */
  day: string
  /** Название еврейского месяца. */
  month: string
  /** Год. */
  year: string
}

/**
 * Разбирает еврейскую дату дня dateISO на части (день/месяц/год). Пустые части
 * при неразбираемом вводе. Использует formatToParts, чтобы не зависеть от
 * порядка/разделителей конкретной локали.
 */
export function hebrewDateParts(dateISO: string): HebrewDateParts {
  const dt = parseISODate(dateISO)
  if (!dt) return { day: '', month: '', year: '' }
  const parts = hebrewFormatter().formatToParts(dt)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? ''
  return { day: pick('day'), month: pick('month'), year: pick('year') }
}

/**
 * Полная еврейская дата одной строкой ('день месяц год'). Пустая строка при
 * неразбираемом вводе.
 */
export function formatHebrewDate(dateISO: string): string {
  const dt = parseISODate(dateISO)
  if (!dt) return ''
  return hebrewFormatter().format(dt)
}

/** Только номер дня еврейского месяца — для ячеек сетки. Пусто при ошибке. */
export function hebrewDayNumber(dateISO: string): string {
  return hebrewDateParts(dateISO).day
}
