'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { useMe } from '@/lib/hooks/useMe'

type Method = 'typed' | 'drawn' | 'both'

/**
 * Пункт настроек «Способ цифровой подписи» — только для superadmin. Читает
 * GET /api/settings/signature, меняет через PUT (superadmin-only на сервере).
 * Не рендерит ничего для остальных.
 */
export default function SignatureMethodSetting() {
  const t = useTranslations('settings')
  const me = useMe()
  const [method, setMethod] = useState<Method | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/signature')
      if (res.ok) { const b = await res.json(); setMethod((b.method ?? 'both') as Method) }
    } catch { /* тихо */ }
  }, [])
  useEffect(() => { load() }, [load])

  async function choose(m: Method) {
    if (m === method) return
    const prev = method
    setMethod(m); setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/settings/signature', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: m }),
      })
      if (!res.ok) { setMethod(prev); setError(t('signature.save_error')); return }
      setSaved(true); setTimeout(() => setSaved(false), 1800)
    } finally {
      setSaving(false)
    }
  }

  // Только superadmin и только когда значение загружено.
  if (!me || !me.roles.includes('superadmin') || method == null) return null

  const OPTIONS: Method[] = ['both', 'typed', 'drawn']

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{t('signature.title')}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 14px' }}>{t('signature.subtitle')}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {OPTIONS.map(m => (
          <button
            key={m}
            onClick={() => choose(m)}
            disabled={saving}
            style={{
              fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 8, cursor: saving ? 'default' : 'pointer',
              border: `1.5px solid ${method === m ? 'var(--accent)' : 'var(--border)'}`,
              background: method === m ? 'var(--accent-tint)' : 'var(--surface)',
              color: method === m ? '#1D4ED8' : 'var(--text-muted)',
            }}
          >
            {t(`signature.${m}`)}
          </button>
        ))}
        {saved && <span style={{ fontSize: 12, fontWeight: 600, color: '#059669' }}>{t('signature.saved')}</span>}
        {error && <span style={{ fontSize: 12, color: '#DC2626' }}>{error}</span>}
      </div>
    </div>
  )
}
