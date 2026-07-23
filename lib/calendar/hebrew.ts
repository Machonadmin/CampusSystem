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
// Nameрочно БЕЗ numberingSystem:'hebr' — движок V8 (Node/Chrome/Vercel) вырезает
// алгоритмические системы нумерации и молча откатывается на латиницу («23»,
// «5786»). Поэтому день/год мы берём из Intl как числа и сами переводим в
// еврейские буквы (гематрия) — детерминированно и одинаково во всех браузерах.
// Название месяца — из Intl (это слово на иврите, не число).
function hebrewFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('he-u-ca-hebrew', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// ─── Гематрия: число → еврейские буквы (כ״ג, ט״ו, תשפ״ו) ──────────────────────
const GEM_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
const GEM_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
const GEM_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק']
const GERESH = '׳'     // ׳  — после одиночной буквы
const GERSHAYIM = '״'  // ״  — перед последней буквой в многобуквенном числе

/**
 * Число → строка еврейскими буквами (гематрия). Берётся короткая форма
 * (mod 1000) — так пишут и день месяца, и год без тысяч (5786 → תשפ״ו).
 * Спец-случаи 15→ט״ו и 16→ט״ז (чтобы не писать имя Бога י-ה / י-ו).
 */
export function toGematria(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return String(num)
  let n = Math.floor(num) % 1000
  let s = GEM_HUNDREDS[Math.floor(n / 100)] ?? ''
  n %= 100
  if (n === 15) s += 'טו'
  else if (n === 16) s += 'טז'
  else {
    s += GEM_TENS[Math.floor(n / 10)]
    s += GEM_ONES[n % 10]
  }
  if (s.length === 0) return String(num)
  if (s.length === 1) return s + GERESH
  return s.slice(0, -1) + GERSHAYIM + s.slice(-1)
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
  // День и год приходят латинскими цифрами (см. hebrewFormatter) — переводим в
  // еврейские буквы сами. Месяц — уже слово на иврите.
  const dayNum = Number(pick('day'))
  const yearNum = Number(pick('year'))
  return {
    day: Number.isFinite(dayNum) && dayNum > 0 ? toGematria(dayNum) : pick('day'),
    month: pick('month'),
    year: Number.isFinite(yearNum) && yearNum > 0 ? toGematria(yearNum) : pick('year'),
  }
}

/**
 * Полная еврейская дата одной строкой ('день месяц год'). Пустая строка при
 * неразбираемом вводе.
 */
export function formatHebrewDate(dateISO: string): string {
  const p = hebrewDateParts(dateISO)
  if (!p.day && !p.month && !p.year) return ''
  // Иврит: день месяц год (напр. «כ״ג בתמוז תשפ״ו» без предлога — коротко).
  return `${p.day} ${p.month} ${p.year}`.replace(/\s+/g, ' ').trim()
}

/** Только номер дня еврейского месяца — для ячеек сетки. Пусто при ошибке. */
export function hebrewDayNumber(dateISO: string): string {
  return hebrewDateParts(dateISO).day
}
