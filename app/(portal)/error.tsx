'use client'

// Граница ошибок студенческого портала: аккуратный запасной вид вместо пустого
// экрана, если падает рендер портала. Текст на иврите, стили — токены темы.
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/LanguageContext'

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('portal')

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{
        maxWidth: 420, textAlign: 'center', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 14, padding: '36px 32px',
        boxShadow: 'var(--shadow-lg, 0 8px 30px rgba(20,24,33,.08))',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }}>{t('error.title')}</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 22px', lineHeight: 1.6 }}>
          {t('error.body')}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => reset()}
            style={{ fontSize: 15, fontWeight: 600, padding: '11px 26px', border: 'none', borderRadius: 9, background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}
          >
            {t('error.retry')}
          </button>
          <Link
            href="/portal"
            style={{ fontSize: 15, fontWeight: 600, padding: '11px 26px', borderRadius: 9, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)', textDecoration: 'none' }}
          >
            {t('error.back')}
          </Link>
        </div>
      </div>
    </div>
  )
}
