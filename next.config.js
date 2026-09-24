const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Нужен для instrumentation.ts на Next 14 (в 15 включён по умолчанию).
  experimental: {
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        // Базовые заголовки защиты для всех ответов:
        //  • nosniff — браузер не «угадывает» тип файла (загруженный документ не
        //    исполнится как скрипт);
        //  • Referrer-Policy — адреса внутренних страниц (с id людей) не уходят
        //    на чужие сайты по ссылкам;
        //  • Permissions-Policy — камера, микрофон и геолокация не нужны
        //    приложению, выключаем их для всех страниц.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Запрет встраивать систему в чужой сайт через iframe (clickjacking:
        // невидимая рамка поверх приманки ловит клики залогиненного сотрудника).
        // Исключение — публичная анкета /apply: её, возможно, встраивают на
        // сайт института, и там нет сессии, которую можно украсть кликом.
        source: '/((?!apply).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
        ],
      },
    ]
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
