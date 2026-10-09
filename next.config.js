const { withSentryConfig } = require('@sentry/nextjs')

// Content-Security-Policy (включена по-настоящему с 2026-10). Две недели она
// работала в режиме Report-Only: на живом сайте не было ни одного нарушения,
// кроме тестового. Теперь браузер отрезает внедрённый чужой <script src=...>,
// отправку данных на чужой сервер (fetch/форма) и т.п. Нарушения по-прежнему
// приходят в /api/public/csp-report (сводка: lib/security/csp-report.ts).
// 'unsafe-inline' для скриптов пока нужен: Next.js вставляет свои inline-скрипты.
const isDev = process.env.NODE_ENV !== 'production'
const CSP_DIRECTIVES = [
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
]
// report-uri, а не report-to: его понимают все браузеры, и отчёт уходит
// сразу (report-to Chrome копит и шлёт пачками с задержкой).
const CSP_REPORT = 'report-uri /api/public/csp-report'
// frame-ancestors — запрет встраивать систему в чужой сайт через iframe
// (clickjacking). Кроме публичной анкеты /apply (см. headers ниже).
const CSP = [...CSP_DIRECTIVES, "frame-ancestors 'self'", CSP_REPORT].join('; ')
const CSP_APPLY = [...CSP_DIRECTIVES, CSP_REPORT].join('; ')

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
          { key: 'Content-Security-Policy', value: CSP },
        ],
      },
      {
        // Та же политика для /apply, но без frame-ancestors. Пути двух правил
        // не пересекаются: при одинаковом ключе заголовка Next оставил бы
        // только последнее совпавшее правило.
        source: '/apply/:path*',
        headers: [{ key: 'Content-Security-Policy', value: CSP_APPLY }],
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
