'use client'

import { useState, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { landingRouteForRoles } from '@/lib/auth/landing'
import { SubmitButton } from '@/components/ui/SubmitButton'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Явный ?from (пришёл со страницы под гейтом) уважаем; иначе — посадка по роли.
  const explicitFrom = searchParams.get('from')
  const t = useTranslations('auth')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? t('error_login_failed'))
        return
      }

      router.push(explicitFrom || landingRouteForRoles(data.roles))
      router.refresh()
    } catch {
      setError(t('error_connection'))
    } finally {
      setLoading(false)
    }
  }

  const label: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6,
  }

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 18, boxShadow: 'var(--shadow)',
      border: '1px solid var(--border)', padding: 32,
    }}>
      {/* Локальные стили: фокус-кольцо и плейсхолдер через токены (inline :focus нельзя). */}
      <style>{`
        .login-input {
          width: 100%; font-size: 14px; padding: 10px 14px; border-radius: 10px;
          border: 1px solid var(--border-strong); background: var(--surface);
          color: var(--text); outline: none; box-sizing: border-box;
          transition: border-color .15s, box-shadow .15s;
        }
        .login-input::placeholder { color: var(--text-faint); }
        .login-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-tint); }
      `}</style>

      <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', margin: '0 0 22px' }}>{t('heading')}</h2>

      <form onSubmit={handleSubmit} noValidate style={{ display: 'grid', gap: 18 }}>

        {/* Email */}
        <div>
          <label htmlFor="email" style={label}>{t('email')}</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="login-input"
          />
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" style={label}>{t('password')}</label>
          <div style={{ position: 'relative' }}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="login-input"
              style={{ paddingInlineEnd: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? t('hide_password') : t('show_password')}
              title={showPassword ? t('hide_password') : t('show_password')}
              style={{
                position: 'absolute', insetBlock: 0, insetInlineEnd: 0,
                display: 'flex', alignItems: 'center', paddingInline: 12,
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)',
              }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showPassword
                  ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
                  : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>}
              </svg>
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, borderRadius: 10,
            background: 'var(--danger-tint)', border: '1px solid var(--danger)', padding: '12px 14px',
          }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="var(--danger)" style={{ marginTop: 2, flexShrink: 0 }}>
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Submit */}
        <SubmitButton
          type="submit"
          loading={loading}
          disabled={loading || !email || !password}
          loadingLabel={t('logging_in')}
          style={{
            width: '100%', padding: '11px 16px', borderRadius: 10,
            background: 'var(--accent-strong)', color: '#fff',
            fontSize: 14, fontWeight: 600, border: 'none',
            cursor: (loading || !email || !password) ? 'not-allowed' : 'pointer',
            opacity: (loading || !email || !password) ? 0.5 : 1,
          }}
        >
          {t('login')}
        </SubmitButton>

      </form>

      {/* Вход студентки — ОТДЕЛЬНЫЙ портал (student_credentials, не person_accounts).
          Без этой ссылки студентки пытались войти здесь и получали «аккаунт
          заблокирован» (это staff-логин). */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
        <a
          href="/portal/login"
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-strong)', textDecoration: 'none' }}
        >
          {t('student_portal_link')}
        </a>
      </div>
    </div>
  )
}
