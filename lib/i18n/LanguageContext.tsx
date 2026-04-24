'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { translations, type Lang, type Translations } from './translations'

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

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ru')

  useEffect(() => {
    const saved = localStorage.getItem('campus_lang') as Lang | null
    if (saved && saved in translations) setLangState(saved)
  }, [])

  function setLang(next: Lang) {
    setLangState(next)
    localStorage.setItem('campus_lang', next)
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
