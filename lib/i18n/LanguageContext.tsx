'use client'

import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from 'react'
import { translations, type Lang, type Translations } from './translations'

type AnyRecord = Record<string, unknown>

/**
 * Словари НЕ импортируются статически: три локали (~640 КБ сырого JSON) грузились
 * в клиентский бандл КАЖДОЙ страницы (+~140 КБ gzip даже на /login). Теперь
 * активную локаль передаёт серверный layout через initialMessages (SSR-текст
 * работает как раньше), а другие локали догружаются динамически только при
 * переключении языка — отдельными чанками, с кэшированием в state.
 */
function loadMessages(lang: Lang): Promise<AnyRecord> {
  switch (lang) {
    case 'he': return import('@/messages/he.json').then(m => m.default as AnyRecord)
    case 'en': return import('@/messages/en.json').then(m => m.default as AnyRecord)
    default: return import('@/messages/ru.json').then(m => m.default as AnyRecord)
  }
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
  messages: AnyRecord
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'ru',
  setLang: () => {},
  t: translations.ru,
  isRTL: false,
  messages: {},
})

export function LanguageProvider({
  children,
  initialLocale = 'ru',
  initialMessages = {},
}: {
  children: ReactNode
  initialLocale?: Lang
  initialMessages?: AnyRecord
}) {
  const [lang, setLangState] = useState<Lang>(initialLocale)
  const [msgsByLang, setMsgsByLang] = useState<Partial<Record<Lang, AnyRecord>>>(
    () => ({ [initialLocale]: initialMessages }),
  )

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    document.cookie = `campus_locale=${next};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`
    fetch('/api/auth/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    })
    // Догружаем словарь выбранного языка (один раз; чанк кэшируется браузером).
    setMsgsByLang(prev => {
      if (!prev[next]) {
        loadMessages(next)
          .then(m => setMsgsByLang(p => ({ ...p, [next]: m })))
          .catch(() => { /* сеть упала — t() отдаст fallback/ключ, не падаем */ })
      }
      return prev
    })
  }, [])

  // Пока словарь нового языка в пути — показываем прежний (без мигания ключей).
  const messages = useMemo(
    () => msgsByLang[lang] ?? msgsByLang[initialLocale] ?? {},
    [msgsByLang, lang, initialLocale],
  )

  const value = useMemo(() => ({
    lang,
    setLang,
    t: translations[lang],
    isRTL: lang === 'he',
    messages,
  }), [lang, setLang, messages])

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
  const { messages } = useLang()
  return useCallback((key: string, fallback?: string): string => {
    const fullPath = namespace ? `${namespace}.${key}` : key
    const result = lookupKey(messages, fullPath)
    if (result === fullPath) return fallback ?? key
    return result
  }, [namespace, messages])
}
