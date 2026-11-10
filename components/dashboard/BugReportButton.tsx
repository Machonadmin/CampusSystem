'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { captureVisibleScreen, NO_SCREENSHOT_ATTR } from '@/lib/feedback/capture'

/**
 * Плавающая кнопка-«жучок» на левом краю экрана для «הצעה לשיפור או באג».
 * Рисуется только у тех, у кого есть право feedback.submit (проверяет Header).
 * Нажатие: сначала снимок видимого экрана (lib/feedback/capture.ts), затем
 * открывается обычная форма замечания с уже приложенным снимком.
 */
export default function BugReportButton({ onOpen }: { onOpen: (screenshot: File | null) => void }) {
  const t = useTranslations('feedback')
  const [capturing, setCapturing] = useState(false)

  async function click() {
    if (capturing) return
    setCapturing(true)
    try {
      const shot = await captureVisibleScreen()
      onOpen(shot)
    } finally {
      setCapturing(false)
    }
  }

  const label = capturing ? t('capturing') : t('bug_button')
  return (
    <button
      type="button"
      onClick={click}
      disabled={capturing}
      aria-label={label}
      title={label}
      {...{ [NO_SCREENSHOT_ATTR]: '' }}
      style={{
        // Всегда левый край экрана (и в иврите, и в русском/английском).
        position: 'fixed', left: 0, top: '55%', zIndex: 45,
        width: 40, height: 44,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '0 12px 12px 0',
        border: '1px solid var(--border-strong)', borderLeft: 'none',
        background: 'var(--surface)', color: 'var(--accent)',
        boxShadow: 'var(--shadow-lg)',
        cursor: capturing ? 'progress' : 'pointer',
        opacity: capturing ? 0.6 : 1,
      }}
    >
      {/* Жучок */}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 2l1.88 1.88" />
        <path d="M14.12 3.88L16 2" />
        <path d="M9 7.13v-1a3.003 3.003 0 116 0v1" />
        <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6" />
        <path d="M12 20v-9" />
        <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
        <path d="M6 13H2" />
        <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
        <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
        <path d="M22 13h-4" />
        <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
      </svg>
    </button>
  )
}
