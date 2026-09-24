'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

type Theme = 'light' | 'dark'

/**
 * Переключатель темы «светлая / тёмная». По умолчанию тема следует настройке
 * устройства (prefers-color-scheme); как только пользователь нажимает — выбор
 * становится явным, сохраняется в localStorage (у каждого свой на его
 * устройстве) и выставляется через data-theme на <html>. Скрипт без-мигания в
 * app/layout.tsx применяет сохранённый выбор ещё до первой отрисовки.
 */
export default function ThemeToggle() {
  const t = useTranslations('navigation')
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    let initial: Theme
    try {
      const saved = localStorage.getItem('theme')
      if (saved === 'light' || saved === 'dark') initial = saved
      else initial = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch {
      initial = 'light'
    }
    setTheme(initial)
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { localStorage.setItem('theme', next) } catch { /* приватный режим */ }
    document.documentElement.setAttribute('data-theme', next)
  }

  // До монтирования тема неизвестна — показываем нейтральную иконку (луна),
  // чтобы не было рассинхрона гидрации.
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggle}
      aria-label={t('toggle_theme')}
      title={t('toggle_theme')}
      className="icon-ghost flex items-center justify-center rounded-lg transition flex-shrink-0"
      style={{ width: 38, height: 38, color: 'var(--text-muted)', border: '1px solid var(--border)' }}
    >
      {isDark ? (
        // Солнце — нажатие вернёт светлую.
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      ) : (
        // Луна — нажатие включит тёмную.
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A8 8 0 1111.2 3 6 6 0 0021 12.8z" />
        </svg>
      )}
    </button>
  )
}
