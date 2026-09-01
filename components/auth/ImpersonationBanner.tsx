'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Постоянная плашка режима «צפייה כמשתמש»: показывается, пока владелец смотрит
 * систему глазами сотрудника. Ясно сообщает, ЧЬИМИ глазами, что режим только для
 * чтения, и даёт кнопку вернуться в свой аккаунт.
 */
export default function ImpersonationBanner({ targetName }: { targetName: string | null }) {
  const t = useTranslations('impersonation')
  const [busy, setBusy] = useState(false)

  async function exit() {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/auth/stop-impersonate', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      window.location.href = d?.relogin ? '/login' : '/dashboard'
    } catch {
      window.location.href = '/dashboard'
    }
  }

  return (
    <div
      role="status"
      style={{
        position: 'fixed', insetInline: 0, bottom: 0, zIndex: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 0px))',
        background: 'var(--warn)', color: '#1a1200',
        boxShadow: '0 -4px 16px -6px rgba(0,0,0,.4)',
        fontSize: 13.5, fontWeight: 600,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
        </svg>
        {t('viewing_as').replace('{name}', targetName || '—')} · <span style={{ fontWeight: 700 }}>{t('read_only')}</span>
      </span>
      <button
        onClick={exit}
        disabled={busy}
        style={{
          border: '1px solid rgba(0,0,0,.35)', background: 'rgba(255,255,255,.35)', color: '#1a1200',
          borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
        }}
      >
        {t('exit')}
      </button>
    </div>
  )
}
