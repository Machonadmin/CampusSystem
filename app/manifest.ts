import type { MetadataRoute } from 'next'

/**
 * PWA-манифест: даёт «Установить приложение» / «Добавить на главный экран» на
 * телефоне — система открывается в отдельном окне без адресной строки, со своей
 * иконкой. Иконки сгенерированы из public/logo.png с безопасными полями
 * (одни файлы годятся и как maskable для круглой маски Android).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'הקמפוס — מכון חמש',
    short_name: 'מכון חמש',
    description: 'מערכת ניהול הקמפוס של מכון חמש',
    start_url: '/dashboard',
    display: 'standalone',
    dir: 'rtl',
    lang: 'he',
    background_color: '#eef1f5',
    theme_color: '#0d9488',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
