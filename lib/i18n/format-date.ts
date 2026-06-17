const LOCALE_MAP: Record<string, string> = { ru: 'ru-RU', he: 'he-IL', en: 'en-US' }

function toIntlLocale(lang: string): string {
  return LOCALE_MAP[lang] ?? 'ru-RU'
}

/** "15.06.2026" / "15/06/2026" / "15.06.2026" */
export function formatDate(dateStr: string, lang: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return new Intl.DateTimeFormat(toIntlLocale(lang), {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d)
}

/** "15 июн" / "15 Jun" / "15 יונ" */
export function formatDateShort(dateStr: string, lang: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return new Intl.DateTimeFormat(toIntlLocale(lang), {
    day: '2-digit', month: 'short',
  }).format(d)
}

/** "15 июня 2026 г." / "June 15, 2026" / "15 ביוני 2026" */
export function formatDateLong(dateStr: string, lang: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return new Intl.DateTimeFormat(toIntlLocale(lang), {
    day: '2-digit', month: 'long', year: 'numeric',
  }).format(d)
}

/** "15.06.2026, 14:30" */
export function formatDateTime(dateStr: string, lang: string): string {
  const d = new Date(dateStr)
  return new Intl.DateTimeFormat(toIntlLocale(lang), {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}
