'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'

export default function PortalLoginForm() {
  const router = useRouter()
  const t = useTranslations('portal')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
        <input
          id="portal-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          style={inputStyle}
        />
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
