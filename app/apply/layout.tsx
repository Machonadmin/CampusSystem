import { getCookieLocale } from '@/lib/i18n/locale'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { getServerMessages } from '@/lib/i18n/server-messages'

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  const locale = getCookieLocale()
  return (
    <LanguageProvider initialLocale={locale} initialMessages={getServerMessages(locale)}>
      {children}
    </LanguageProvider>
  )
}
