import { NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/public/rate-limit'
import { serverT } from '@/lib/i18n/api-errors'

/**
 * Тормоз для чувствительных к перебору эндпоинтов аутентификации
 * (login, portal/login, смена пароля). Раньше их сдерживала ТОЛЬКО стоимость
 * bcrypt — этого мало против credential-stuffing/brute-force. Здесь простой
 * лимит по IP поверх общего in-memory лимитера (тот же, что у публичной формы).
 *
 * Ограничение честно: состояние в памяти инстанса, на serverless сбрасывается
 * при холодном старте — это дешёвый первый барьер, а не строгая гарантия
 * (см. lib/public/rate-limit.ts). Достаточно, чтобы примитивный перебор паролей
 * упёрся в 429 вместо тысяч попыток в секунду.
 *
 * @param request  входящий запрос (для IP из заголовков)
 * @param bucket   префикс ведра (различает login / portal-login / change-pw)
 * @param limit    максимум попыток в окне (по умолчанию 10)
 * @param windowMs длина окна (по умолчанию 5 минут)
 * @returns 429-ответ, если лимит превышен, иначе null (продолжаем обработку)
 */
export function throttleAuth(
  request: Request,
  bucket: string,
  limit = 10,
  windowMs = 5 * 60 * 1000,
): NextResponse | null {
  const ip = clientIp(request.headers)
  const rl = rateLimit(`${bucket}:${ip}`, limit, windowMs)
  if (rl.ok) return null
  return NextResponse.json(
    { error: serverT('too_many_attempts'), code: 'too_many_attempts' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
  )
}
