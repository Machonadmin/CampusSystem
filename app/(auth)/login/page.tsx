import { Suspense } from 'react'
import { getCookieLocale } from '@/lib/i18n/locale'
import ruMessages from '@/messages/ru.json'
import heMessages from '@/messages/he.json'
import enMessages from '@/messages/en.json'
import LoginForm from './LoginForm'

const messagesByLocale = { ru: ruMessages, he: heMessages, en: enMessages }

export default function LoginPage() {
  const t = messagesByLocale[getCookieLocale()].auth

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'radial-gradient(1100px 520px at 50% -8%, var(--accent-tint), transparent 62%), var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 16px', borderRadius: 16,
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow)',
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.6}
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 10L12 5 2 10l10 5 10-5z" />
              <path d="M6 12v5c0 1 2.5 2.5 6 2.5s6-1.5 6-2.5v-5" />
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0, letterSpacing: '-0.01em' }}>
            {t.campus_title}
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: 'var(--text-muted)' }}>{t.campus_subtitle}</p>
        </div>

        <Suspense fallback={
          <div style={{
            background: 'var(--surface)', borderRadius: 18, boxShadow: 'var(--shadow)',
            border: '1px solid var(--border)', padding: 32,
            display: 'flex', justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="animate-spin" style={{ color: 'var(--accent)' }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
              <path fill="currentColor" opacity="0.75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        }>
          <LoginForm />
        </Suspense>

      </div>
    </div>
  )
}
