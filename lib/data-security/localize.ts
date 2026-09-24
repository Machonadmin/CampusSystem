import type { Lang } from '@/lib/i18n/translations'

// ─── Выбор подписи на языке пользователя ─────────────────────────────────────
//
// Требование владельца: «нигде на сайте подпись не написана по-английски —
// пиши на языке людей, с объяснением». Поэтому технический код (studies.set_grades)
// подписью не бывает НИКОГДА, а подпись выбирается по языку с честным
// запасным вариантом.
//
// Порядок отката: язык пользователя → иврит → русский → английский. Иврит
// раньше русского потому, что интерфейс учреждения ивритский: если перевода
// нет, читаемая ивритская строка полезнее непонятной русской.

export interface Localized {
  he: string | null
  ru: string | null
  en: string | null
}

const ORDER: Record<Lang, readonly (keyof Localized)[]> = {
  he: ['he', 'ru', 'en'],
  ru: ['ru', 'he', 'en'],
  en: ['en', 'he', 'ru'],
}

/**
 * Подпись на языке пользователя. Возвращает null, только если нет НИ ОДНОГО
 * перевода — вызывающий код обязан показать это как «нет подписи», а не
 * подставлять технический код.
 */
export function pickLang(lang: Lang, value: Localized): string | null {
  for (const key of ORDER[lang]) {
    const v = value[key]
    if (v !== null && v !== undefined && v.trim() !== '') return v.trim()
  }
  return null
}

/** Есть ли вообще хоть какое-то объяснение (на любом языке). */
export function hasAnyText(value: Localized): boolean {
  return pickLang('he', value) !== null
}
