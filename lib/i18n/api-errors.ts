import { NextResponse } from 'next/server'
import { getCookieLocale } from './locale'
import type { Lang } from './translations'
import ruMessages from '@/messages/ru.json'
import heMessages from '@/messages/he.json'
import enMessages from '@/messages/en.json'

// ─── Серверный перевод ошибок API ────────────────────────────────────────────
//
// Хендлеры маршрутов раньше возвращали захардкоженные русские строки
// (`NextResponse.json({ error: 'Документ не найден' }, ...)`), которые
// показывались пользователю независимо от выбранного языка. Здесь сообщение
// берётся из неймспейса `errors` в messages/{ru,he,en}.json по стабильному
// коду, а сам код читается из cookie `campus_locale` (по умолчанию 'ru' —
// как в getCookieLocale). Форма ответа сохранена: поле `error` осталось
// строкой (старые клиенты, читающие body.error, продолжают работать), к нему
// ДОБАВЛЕНО машинно-стабильное поле `code`.

type ErrorMap = Record<string, string>

const errorsByLang: Record<Lang, ErrorMap> = {
  ru: (ruMessages as { errors?: ErrorMap }).errors ?? {},
  he: (heMessages as { errors?: ErrorMap }).errors ?? {},
  en: (enMessages as { errors?: ErrorMap }).errors ?? {},
}

/**
 * Переводит код ошибки в сообщение на языке текущего запроса.
 * Фолбэк: русский (язык-источник) → сам код (чтобы ничего не падало,
 * если код опечатан).
 */
export function serverT(code: string): string {
  const locale = getCookieLocale()
  return errorsByLang[locale]?.[code] ?? errorsByLang.ru[code] ?? code
}

/**
 * Единый помощник для ошибок API. Возвращает
 * `NextResponse.json({ error: <перевод>, code }, { status })`.
 *
 * @param code   стабильный код из неймспейса `errors`
 * @param status HTTP-статус (без изменений относительно прежнего кода)
 * @param extra  доп. поля ответа (например, { details } для zod) — форма
 *               ответа при этом расширяется только явно переданными полями
 */
export function apiError(
  code: string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: serverT(code), code, ...(extra ?? {}) }, { status })
}
