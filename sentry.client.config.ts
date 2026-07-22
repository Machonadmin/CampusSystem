// Sentry — клиентская инициализация (браузер). БЕЗ NEXT_PUBLIC_SENTRY_DSN —
// no-op, поэтому без настройки ничего не грузится и не шлётся.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? 'production',
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    // Session Replay выключен по умолчанию (приватность + вес). Включается env.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_REPLAY_ERROR_RATE ?? '0'),
    sendDefaultPii: false,
  })
}
