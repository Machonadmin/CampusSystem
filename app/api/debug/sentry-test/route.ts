import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'

/**
 * GET /api/debug/sentry-test — намеренно отправляет тестовую ошибку в Sentry,
 * чтобы владелец мог убедиться, что мониторинг ДЕЙСТВИТЕЛЬНО принимает события.
 *
 * Защита: только суперадмин (роль superadmin в сессии). Никакого спама от ботов —
 * без входа под суперадмином вернётся 403.
 *
 * Поведение:
 *  - DSN не задан  → { ok:false, sentry:'not_configured' } (Sentry работает как
 *    no-op; сначала задайте SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN в Vercel).
 *  - DSN задан     → captureException + flush; возвращает event_id, который
 *    можно найти в дашборде Sentry.
 */
export async function GET() {
  const session = await getSession()
  if (!session || !session.roles?.includes('superadmin')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN
  if (!dsn) {
    return NextResponse.json({
      ok: false,
      sentry: 'not_configured',
      message: 'Sentry DSN не задан — задайте SENTRY_DSN и NEXT_PUBLIC_SENTRY_DSN в Vercel, затем повторите.',
    })
  }

  try {
    const Sentry = await import('@sentry/nextjs')
    const eventId = Sentry.captureException(
      new Error(`CampusSystem Sentry test (server) — ${session.person_id}`),
      { tags: { source: 'sentry-test-endpoint' } },
    )
    // Гарантируем доставку до завершения serverless-функции.
    await Sentry.flush(3000)
    return NextResponse.json({
      ok: true,
      sentry: 'sent',
      event_id: eventId,
      message: 'Тестовая ошибка отправлена в Sentry. Найдите событие с этим event_id в дашборде.',
    })
  } catch (err) {
    const e = err as { message?: string }
    return NextResponse.json(
      { ok: false, sentry: 'error', message: e.message ?? 'unknown error' },
      { status: 500 },
    )
  }
}
