import { getCookieLocale } from '@/lib/i18n/locale'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  const locale = getCookieLocale()
  return (
    <LanguageProvider initialLocale={locale}>
      {children}
    </LanguageProvider>
  )
}
