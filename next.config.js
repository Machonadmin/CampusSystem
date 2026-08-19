const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Нужен для instrumentation.ts на Next 14 (в 15 включён по умолчанию).
  experimental: {
    instrumentationHook: true,
  },
}

// withSentryConfig оборачивает конфиг: клиентская инициализация подхватывается
// автоматически, а source maps выгружаются ТОЛЬКО при наличии SENTRY_AUTH_TOKEN
// (иначе шаг пропускается без ошибки). Без Sentry-env сборка не меняется.
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  sourcemaps: {
    // Без auth-токена выгрузка source maps пропускается; явно тихо.
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
})
