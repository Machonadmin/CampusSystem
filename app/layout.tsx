import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'
import { getCookieLocale } from '@/lib/i18n/locale'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  weight: ['400', '500', '700'],
  variable: '--font-heebo',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CampusSystem',
  description: 'Campus Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = getCookieLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'
  return (
    <html lang={locale} dir={dir} className={heebo.variable}>
      <body>{children}</body>
    </html>
  )
}
