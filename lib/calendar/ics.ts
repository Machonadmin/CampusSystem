// Генерация iCalendar (RFC 5545) для подписки внешних календарей (Google и др.).
// Чистые функции — без сети/БД, чтобы легко тестировать.

/** Экранирование текста значения по RFC 5545 (запятая, точка-с-запятой, слеш, перевод строки). */
export function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** Складывание длинных строк: не более 75 октетов, продолжение — с ведущим пробелом. */
export function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  if (rest.length) parts.push(' ' + rest)
  return parts.join('\r\n')
}

const pad = (n: number) => String(n).padStart(2, '0')

/** UTC-инстант → 'YYYYMMDDTHHMMSSZ'. */
export function toUtcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/** 'YYYY-MM-DD' → 'YYYYMMDD' (для событий на весь день, VALUE=DATE). */
export function toDateStamp(iso: string): string {
  return iso.replace(/-/g, '').slice(0, 8)
}

/** 'YYYY-MM-DD' + 'HH:MM' → плавающее локальное 'YYYYMMDDTHHMMSS' (без Z/TZID). */
export function toFloating(dateISO: string, timeHHMM: string): string {
  const d = toDateStamp(dateISO)
  const [h = '00', m = '00'] = timeHHMM.split(':')
  return `${d}T${pad(Number(h))}${pad(Number(m))}00`
}

/**
 * Строка времени встречи из БД ('2026-10-05T10:00:00+00:00') → плавающее
 * 'YYYYMMDDTHHMMSS'. Приложение хранит в appointments «настенное» время
 * (форма шлёт '2026-10-05T10:00' без зоны, экран показывает часы из строки),
 * поэтому в фид отдаём те же часы, а не UTC-инстант — иначе Google сдвигал
 * встречу на +2/+3 часа. null — строка не распознана.
 */
export function wallClockFloating(iso: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso)
  return m ? toFloating(m[1], `${m[2]}:${m[3]}`) : null
}

export type IcsEvent = {
  uid: string
  summary: string
  description?: string
  location?: string
} & (
  | { kind: 'allday'; date: string }                    // весь день: 'YYYY-MM-DD'
  | { kind: 'floating'; start: string; end?: string }   // локальное 'YYYYMMDDTHHMMSS'
  | { kind: 'utc'; start: Date; end?: Date }             // точный инстант
)

/**
 * Собирает VCALENDAR-документ. `now` инжектируется (для детерминированных тестов).
 * Значения PRODID/CALNAME задаёт вызывающий; строки экранируются и складываются.
 */
export function buildICS(opts: { name: string; events: IcsEvent[]; now?: Date }): string {
  const now = opts.now ?? new Date()
  const dtstamp = toUtcStamp(now)
  const out: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Machon Chamesh//Campus Calendar//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeICS(opts.name)}`),
    'X-PUBLISHED-TTL:PT6H',
    // Плавающие времена фида — израильские: без зоны Google может прочесть их как UTC.
    'X-WR-TIMEZONE:Asia/Jerusalem',
  ]
  for (const ev of opts.events) {
    out.push('BEGIN:VEVENT')
    out.push(foldLine(`UID:${ev.uid}`))
    out.push(`DTSTAMP:${dtstamp}`)
    if (ev.kind === 'allday') {
      out.push(`DTSTART;VALUE=DATE:${toDateStamp(ev.date)}`)
    } else if (ev.kind === 'floating') {
      out.push(`DTSTART:${ev.start}`)
      if (ev.end) out.push(`DTEND:${ev.end}`)
    } else {
      out.push(`DTSTART:${toUtcStamp(ev.start)}`)
      if (ev.end) out.push(`DTEND:${toUtcStamp(ev.end)}`)
    }
    out.push(foldLine(`SUMMARY:${escapeICS(ev.summary)}`))
    if (ev.description) out.push(foldLine(`DESCRIPTION:${escapeICS(ev.description)}`))
    if (ev.location) out.push(foldLine(`LOCATION:${escapeICS(ev.location)}`))
    out.push('END:VEVENT')
  }
  out.push('END:VCALENDAR')
  return out.join('\r\n') + '\r\n'
}
