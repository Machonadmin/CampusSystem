import { getCookieLocale } from '@/lib/i18n/locale'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'

/** Общая обёртка портала студентки: даёт контекст языка (RTL для иврита). */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const locale = getCookieLocale()
  return (
    <LanguageProvider initialLocale={locale}>
      {children}
    </LanguageProvider>
  )
}
