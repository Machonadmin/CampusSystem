'use client'

// Граница ошибок сегмента /dashboard: ловит ошибку рендера ЛЮБОГО экрана
// дашборда и показывает аккуратный запасной вид ВНУТРИ оболочки (сайдбар/шапка
// остаются на месте), с кнопкой «повторить» (reset перерисовывает только
// контент) и ссылкой на главную. В отличие от global-error, НЕ заменяет layout.
//
// Текст захардкожен на иврите намеренно: граница ошибок должна быть максимально
// устойчивой и не зависеть от контекста приложения, который мог сломаться.
// Стили — через токены темы, поэтому вид корректен и в тёмной теме.
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'

export default function DashboardError({
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
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        maxWidth: 440, textAlign: 'center', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 14, padding: '36px 32px',
        boxShadow: 'var(--shadow-lg, 0 8px 30px rgba(20,24,33,.08))',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }}>אירעה שגיאה בטעינת המסך</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 22px', lineHeight: 1.6 }}>
          משהו השתבש בעת הצגת הדף. אפשר לנסות שוב או לחזור לדף הבית.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => reset()}
            style={{ fontSize: 15, fontWeight: 600, padding: '11px 26px', border: 'none', borderRadius: 9, background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
          >
            נסה שוב
          </button>
          <Link
            href="/dashboard"
            style={{ fontSize: 15, fontWeight: 600, padding: '11px 26px', borderRadius: 9, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)', textDecoration: 'none' }}
          >
            לדף הבית
          </Link>
        </div>
      </div>
    </div>
  )
}
