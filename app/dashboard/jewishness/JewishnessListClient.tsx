'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// Плейсхолдер: реальная модель записей проверки появится позже. Пока — заголовок
// модуля + пустой список из GET /api/jewishness.
interface VerificationItem {
  id: string
}

export default function JewishnessListClient() {
  const t = useTranslations('jewishness')

  const [items, setItems] = useState<VerificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/jewishness')
      if (!res.ok) {
        setError(t('load_error'))
        setItems([])
        return
      }
      const b = await res.json()
      setItems(b.items ?? [])
    } catch {
      setError(t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('jewishness'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(202,138,4,0.15)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('subtitle')}</div>
      </div>

      {/* Body */}
      {error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('loading')}</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(it => (
            <div key={it.id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 16px', fontSize: 14, color: '#111827' }}>
              {it.id}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
