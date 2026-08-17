'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'

export default function PortalLoginForm() {
  const router = useRouter()
  const t = useTranslations('portal')

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
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? t('error'))
        return
      }
      router.push('/portal')
      router.refresh()
    } catch {
      setError(t('error'))
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1px solid var(--border-strong)', borderRadius: 8,
    background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6,
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: 'grid', gap: 16 }}>
      <div>
        <label htmlFor="portal-email" style={labelStyle}>{t('email')}</label>
        <input
          id="portal-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="portal-password" style={labelStyle}>{t('password')}</label>
        <div style={{ position: 'relative' }}>
          <input
            id="portal-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{ ...inputStyle, paddingInlineEnd: 44 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            aria-label={showPassword ? t('hide_password') : t('show_password')}
            title={showPassword ? t('hide_password') : t('show_password')}
            style={{ position: 'absolute', insetInlineEnd: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, lineHeight: 0 }}
          >
            <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {showPassword
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
                : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>}
            </svg>
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>{t('forgot_password')}</div>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint, rgba(220,38,38,0.08))', border: '1px solid var(--danger)', borderRadius: 8, padding: '9px 12px' }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !email || !password}
        style={{
          width: '100%', padding: '11px 16px', fontSize: 14, fontWeight: 600,
          color: '#fff', background: 'var(--accent-strong)', border: 'none',
          borderRadius: 8, cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
          opacity: loading || !email || !password ? 0.55 : 1, transition: 'opacity 0.15s',
        }}
      >
        {loading ? '…' : t('sign_in')}
      </button>
    </form>
  )
}
