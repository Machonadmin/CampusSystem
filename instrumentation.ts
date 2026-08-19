// Next.js instrumentation hook. Грузит серверную/edge-конфигурацию Sentry по
// рантайму и прокидывает ошибки App Router через onRequestError. БЕЗ DSN обе
// конфигурации — no-op.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs'
