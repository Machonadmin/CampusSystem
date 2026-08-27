import type { Metadata, Viewport } from 'next'
import { Rubik } from 'next/font/google'
import './globals.css'
import { getCookieLocale } from '@/lib/i18n/locale'

// Rubik вместо Heebo: у Heebo НЕТ кириллицы — русский интерфейс падал в
// системный шрифт и типографика «смешивалась». Rubik покрывает все три языка
// приложения (иврит + латиница + кириллица) одним начертанием.
const appFont = Rubik({
  subsets: ['hebrew', 'latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-heebo',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CampusSystem',
  description: 'Campus Management System',
}

// Без width=device-width мобильные браузеры рендерят страницу на ~980px и
// «отдаляют» — тогда любая адаптивная вёрстка не работает. Это база для мобилы.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Тема следует настройке устройства; сообщаем браузеру про обе схемы, чтобы
  // нативные элементы (скроллбары, поля) красились под текущую тему.
  colorScheme: 'light dark',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = getCookieLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'
  return (
    <html lang={locale} dir={dir} className={appFont.variable}>
      <body>
        {/* Применяем сохранённый выбор темы ДО отрисовки — без мигания. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  )
}
