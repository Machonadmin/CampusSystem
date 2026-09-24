import { getCookieLocale } from '@/lib/i18n/locale'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { getServerMessages } from '@/lib/i18n/server-messages'

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  // Публичная страница для абитуриенток: без явного выбора языка (нет cookie)
  // открываем на иврите, а не на русском (дефолт персонала).
  const locale = getCookieLocale('he')
  return (
    <LanguageProvider initialLocale={locale} initialMessages={getServerMessages(locale)}>
      {children}
    </LanguageProvider>
  )
}
