// Sentry — серверная инициализация (Node runtime). Загружается через
// instrumentation.ts → register(). БЕЗ DSN ничего не делает (no-op), поэтому
// dev/CI/локальная сборка не зависят от Sentry. Секрет — только в env.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.VERCEL_ENV ?? 'production',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    // PII не отправляем: без email/тел лидов в трейсах ошибок.
    sendDefaultPii: false,
  })
}
