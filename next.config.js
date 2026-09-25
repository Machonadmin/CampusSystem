const { withSentryConfig } = require('@sentry/nextjs')

// Content-Security-Policy в режиме «только записывать» (Report-Only): браузер
// НИЧЕГО не блокирует, а сообщает в /api/public/csp-report, что было бы
// заблокировано (сводка: lib/security/csp-report.ts). Цель — через неделю-две
// убедиться, что система не грузит ничего лишнего, и включить политику
// по-настоящему: тогда внедрённый чужой <script src=...>, отправка данных на
// чужой сервер (fetch/форма) и т.п. будут отрезаны браузером.
// 'unsafe-inline' для скриптов пока нужен: Next.js вставляет свои inline-скрипты.
const isDev = process.env.NODE_ENV !== 'production'
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://vercel.live`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.sentry.io https://*.supabase.co https://vercel.live",
  "media-src 'self' blob: https:",
  "frame-src 'self' https://vercel.live",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // report-uri, а не report-to: его понимают все браузеры, и отчёт уходит
  // сразу (report-to Chrome копит и шлёт пачками с задержкой).
  'report-uri /api/public/csp-report',
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
          { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
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
