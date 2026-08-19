'use client'

// Глобальная граница ошибок App Router: ловит ошибки рендера верхнего уровня
// (когда падает сам root layout) и отправляет их в Sentry. Заменяет корневой
// layout, поэтому обязана рендерить собственные <html>/<body>. Sentry без DSN —
// no-op, так что этот файл безопасен и без настроенного мониторинга.
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', background: '#f5f7fa', color: '#1b2230' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 440, textAlign: 'center', background: '#fff', border: '1px solid #e3e7ee', borderRadius: 14, padding: '36px 32px', boxShadow: '0 8px 30px rgba(20,24,33,.08)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>אירעה שגיאה בלתי צפויה</h1>
            <p style={{ fontSize: 14, color: '#5d6577', margin: '0 0 22px', lineHeight: 1.6 }}>
              משהו השתבש. הצוות עודכן אוטומטית. אפשר לנסות שוב.
            </p>
            <button
              onClick={() => reset()}
              style={{ fontSize: 15, fontWeight: 600, padding: '11px 26px', border: 'none', borderRadius: 9, background: '#0f766e', color: '#fff', cursor: 'pointer' }}
            >
              נסה שוב
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
