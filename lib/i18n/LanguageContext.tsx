'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { translations, type Lang, type Translations } from './translations'
import ruMessages from '@/messages/ru.json'
import heMessages from '@/messages/he.json'
import enMessages from '@/messages/en.json'

type AnyRecord = Record<string, unknown>

const allMessages: Record<Lang, AnyRecord> = {
  ru: ruMessages as AnyRecord,
  he: heMessages as AnyRecord,
  en: enMessages as AnyRecord,
}

function lookupKey(obj: AnyRecord, path: string): string {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const part of parts) {
    if (typeof cur !== 'object' || cur === null) return path
    cur = (cur as AnyRecord)[part]
  }
  return typeof cur === 'string' ? cur : path
}

interface LanguageContextType {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Translations
  isRTL: boolean
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'ru',
  setLang: () => {},
  t: translations.ru,
  isRTL: false,
})

export function LanguageProvider({
  children,
  initialLocale = 'ru',
}: {
  children: ReactNode
  initialLocale?: Lang
}) {
  const [lang, setLangState] = useState<Lang>(initialLocale)

  function setLang(next: Lang) {
    setLangState(next)
    document.cookie = `campus_locale=${next};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`
    fetch('/api/auth/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    })
  }

  const t = translations[lang]
  const isRTL = lang === 'he'

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL }}>
      <div dir={isRTL ? 'rtl' : 'ltr'} className="contents">
        {children}
      </div>
    </LanguageContext.Provider>
  )
}

export const useLang = () => useContext(LanguageContext)

export function useTranslations(namespace?: string) {
  const { lang } = useLang()
  const messages = allMessages[lang]
  return (key: string): string =>
    lookupKey(messages, namespace ? `${namespace}.${key}` : key)
}
