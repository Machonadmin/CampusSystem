import type { Metadata } from 'next'
import './globals.css'
import { getCookieLocale } from '@/lib/i18n/locale'

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
    <html lang={locale} dir={dir}>
      <body>{children}</body>
    </html>
  )
}
