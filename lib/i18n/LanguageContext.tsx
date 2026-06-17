'use client'

import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from 'react'
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

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    document.cookie = `campus_locale=${next};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`
    fetch('/api/auth/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    })
  }, [])

  const value = useMemo(() => ({
    lang,
    setLang,
    t: translations[lang],
    isRTL: lang === 'he',
  }), [lang, setLang])

  return (
    <LanguageContext.Provider value={value}>
      <div dir={lang === 'he' ? 'rtl' : 'ltr'} className="contents">
        {children}
      </div>
    </LanguageContext.Provider>
  )
}

export const useLang = () => useContext(LanguageContext)

export function useTranslations(namespace?: string) {
  const { lang } = useLang()
  const messages = allMessages[lang]
  return useCallback((key: string, fallback?: string): string => {
    const fullPath = namespace ? `${namespace}.${key}` : key
    const result = lookupKey(messages, fullPath)
    if (result === fullPath) return fallback ?? key
    return result
  }, [lang, namespace, messages])
}
