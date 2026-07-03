/**
 * Простой in-memory rate limiter по ключу (обычно IP) — для публичных
 * endpoint-ов без внешних зависимостей.
 *
 * Ограничение: состояние живёт в памяти инстанса. На Vercel serverless при
 * холодном старте/масштабировании счётчик сбрасывается, так что это НЕ строгая
 * гарантия, а дешёвый барьер против примитивного флуда. Для публичной формы
 * заявок этого достаточно как первый слой (второй — honeypot). Более строгий
 * лимит (через БД/Redis) можно добавить позже, если появится реальный абьюз.
 */

type Hit = { count: number; resetAt: number }

const buckets = new Map<string, Hit>()

export interface RateLimitResult {
  ok: boolean
  retryAfterSec: number
}

/**
 * @param key       идентификатор клиента (IP)
 * @param limit     максимум запросов в окне
 * @param windowMs  длина окна в миллисекундах
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) }
  }

  existing.count += 1
  return { ok: true, retryAfterSec: 0 }
}

/** Извлекает IP клиента из заголовков (Vercel/прокси кладут в x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}
