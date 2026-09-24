import { timingSafeEqual } from 'node:crypto'

/**
 * Авторизация cron-эндпоинтов (/api/cron/*), FAIL-CLOSED.
 *
 * РАНЬШЕ: `if (secret) { ...проверка... }` — то есть при НЕзаданном CRON_SECRET
 * маршрут был открыт всему интернету (аудит §17.8). Кто угодно мог дёргать
 * ночные задачи сколько угодно раз.
 *
 * ТЕПЕРЬ:
 *   • CRON_SECRET не сконфигурирован на сервере → отказ (503) и НИЧЕГО не
 *     выполняется. Лучше «задача не отработала и это видно», чем «открытый вход».
 *   • Сконфигурирован → обязателен заголовок `Authorization: Bearer <CRON_SECRET>`
 *     (Vercel Cron присылает его автоматически). Нет/не тот → 401.
 *
 * Сравнение секретов — постоянного времени (timingSafeEqual), чтобы по времени
 * ответа нельзя было подбирать секрет побайтно.
 */

export type CronAuthDecision =
  | { ok: true }
  | { ok: false; status: 503; reason: 'not_configured' }
  | { ok: false; status: 401; reason: 'unauthorized' }

/** Сравнение строк за постоянное время (без утечки длины совпавшего префикса). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  // timingSafeEqual требует одинаковой длины; разная длина — сразу false, но
  // всё равно прогоняем сравнение равных буферов, чтобы не ветвиться по длине.
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba)
    return false
  }
  return timingSafeEqual(ba, bb)
}

/**
 * Чистое решение по авторизации: из НАСТРОЕННОГО секрета и присланного
 * заголовка Authorization. Без Next/сети — легко тестируется.
 */
export function evaluateCronAuth(
  configuredSecret: string | undefined | null,
  authHeader: string | undefined | null,
): CronAuthDecision {
  const secret = (configuredSecret ?? '').trim()
  // Не сконфигурирован → отказываемся работать (а НЕ работаем без проверки).
  if (secret.length === 0) return { ok: false, status: 503, reason: 'not_configured' }

  const header = (authHeader ?? '').trim()
  const PREFIX = 'Bearer '
  if (!header.startsWith(PREFIX)) return { ok: false, status: 401, reason: 'unauthorized' }

  const presented = header.slice(PREFIX.length)
  if (!safeEqual(presented, secret)) return { ok: false, status: 401, reason: 'unauthorized' }

  return { ok: true }
}

/** Человекочитаемое сообщение для тела ответа/лога. */
export function cronAuthMessage(reason: 'not_configured' | 'unauthorized'): string {
  return reason === 'not_configured'
    ? 'CRON_SECRET is not configured on the server — cron endpoint refuses to run'
    : 'unauthorized'
}

/**
 * Готовый ответ для раннего выхода из cron-обработчика, или null — если запрос
 * авторизован и работу можно выполнять. Использовать ПЕРВОЙ строкой обработчика:
 *
 *   const denied = cronAuthGuard(request)
 *   if (denied) return denied
 *
 * Отказ логируется (в проде это единственный след того, что ночная задача
 * не отработала из-за конфигурации). Опирается на CRON_SECRET.
 */
export function cronAuthGuard(request: { headers: { get(name: string): string | null } }): Response | null {
  const decision = evaluateCronAuth(process.env.CRON_SECRET, request.headers.get('authorization'))
  if (decision.ok) return null

  const message = cronAuthMessage(decision.reason)
  if (decision.reason === 'not_configured') {
    console.error('[cron] refused to run: CRON_SECRET is not configured on the server')
  }
  return Response.json({ error: message, reason: decision.reason }, { status: decision.status })
}
