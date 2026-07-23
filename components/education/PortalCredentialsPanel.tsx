'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Панель управления входом студентки в личный портал (staff-only).
 * GET показывает, создан ли вход; POST создаёт/сбрасывает пароль и показывает
 * сгенерированные email+пароль ОДИН раз (с копированием). Открытый пароль
 * нигде не хранится — сотрудник передаёт его студентке.
 */
export default function PortalCredentialsPanel({ journeyId }: { journeyId: string }) {
  const t = useTranslations('education.portal_credentials')

  const [loaded, setLoaded] = useState(false)
  const [exists, setExists] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [generated, setGenerated] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/portal-credentials`)
      if (res.ok) {
        const b = await res.json()
        setExists(!!b.exists)
        setEmail(b.email ?? null)
      }
    } catch { /* silent */ } finally { setLoaded(true) }
  }, [journeyId])
  useEffect(() => { load() }, [load])

  async function generate() {
    setBusy(true); setErr(''); setGenerated(null)
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/portal-credentials`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(b.error ?? t('error')); return }
      setGenerated({ email: b.email, password: b.password })
      setExists(true); setEmail(b.email)
    } finally { setBusy(false) }
  }

  async function copy(text: string, which: string) {
    try { await navigator.clipboard.writeText(text); setCopied(which); setTimeout(() => setCopied(''), 1500) } catch { /* ignore */ }
  }

  if (!loaded) return null

  const btn: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent-strong)',
    border: 'none', borderRadius: 8, padding: '8px 14px', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
  }
  const copyBtn: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--accent-strong)', background: 'none',
    border: '1px solid var(--border-strong)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer',
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>🔑 {t('title')}</h3>
        <span style={{ fontSize: 11.5, color: exists ? 'var(--success)' : 'var(--text-faint)' }}>
          {exists ? t('exists') : t('no_login')}
        </span>
      </div>

      {exists && email && !generated && (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>{t('email')}: <b style={{ color: 'var(--text)' }}>{email}</b></div>
      )}

      {generated && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12, padding: 10, borderRadius: 8, background: 'var(--success-tint)', border: '1px solid var(--success)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--success)', fontWeight: 600 }}>{t('password_hint')}</div>
          <CredRow label={t('email')} value={generated.email} onCopy={() => copy(generated.email, 'email')} copied={copied === 'email'} copyLabel={copied === 'email' ? t('copied') : t('copy')} style={copyBtn} />
          <CredRow label={t('password')} value={generated.password} onCopy={() => copy(generated.password, 'pw')} copied={copied === 'pw'} copyLabel={copied === 'pw' ? t('copied') : t('copy')} style={copyBtn} mono />
        </div>
      )}

      {err && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{err}</div>}

      <button onClick={generate} disabled={busy} style={btn}>
        {exists ? t('reset') : t('create')}
      </button>
    </div>
  )
}

function CredRow({ label, value, onCopy, copyLabel, style, mono }: {
  label: string; value: string; onCopy: () => void; copied: boolean; copyLabel: string; style: React.CSSProperties; mono?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 64 }}>{label}</div>
      <code style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontFamily: mono ? 'var(--font-mono)' : undefined, wordBreak: 'break-all' }}>{value}</code>
      <button onClick={onCopy} style={style}>{copyLabel}</button>
    </div>
  )
}
