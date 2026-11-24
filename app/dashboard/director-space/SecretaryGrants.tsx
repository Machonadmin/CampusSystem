'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toastError, toastSuccess } from '@/components/ui/toast'
import type { SecretaryGrantCategory } from '@/lib/director/rules'

interface Secretary { id: string; name: string; granted: SecretaryGrantCategory[] }
interface Resp { categories: SecretaryGrantCategory[]; secretaries: Secretary[] }

/**
 * «מה המזכירה מאשרת» — только у המנהל. Переключатель выдаёт/снимает узкое право
 * категории (PUT /api/director/secretaries); то же право видно на «אבטחת מידע».
 */
export default function SecretaryGrants() {
  const t = useTranslations('director')
  const [data, setData] = useState<Resp | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/director/secretaries', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => { if (alive) setData(d) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  const toggle = async (s: Secretary, cat: SecretaryGrantCategory, enabled: boolean) => {
    const key = `${s.id}:${cat}`
    setBusy(key)
    try {
      const r = await fetch('/api/director/secretaries', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: s.id, category: cat, enabled }),
      })
      if (!r.ok) { const b = await r.json().catch(() => ({})); toastError(b.error ?? t('action_failed')); return }
      setData(prev => prev && {
        ...prev,
        secretaries: prev.secretaries.map(x => x.id !== s.id ? x : {
          ...x, granted: enabled ? [...x.granted, cat] : x.granted.filter(c => c !== cat),
        }),
      })
      toastSuccess(t('saved'))
    } catch {
      toastError(t('action_failed'))
    } finally { setBusy(null) }
  }

  if (failed) return <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{t('load_error')}</p>
  if (!data) return null

  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{t('grants_title')}</h2>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>{t('grants_hint')}</p>
      </div>
      {data.secretaries.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: 0 }}>{t('grants_none')}</p>
      )}
      {data.secretaries.map(s => (
        <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            {data.categories.map(cat => {
              const on = s.granted.includes(cat)
              const key = `${s.id}:${cat}`
              return (
                <label key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy === key ? 0.6 : 1 }}>
                  <input type="checkbox" checked={on} disabled={!!busy} onChange={e => toggle(s, cat, e.target.checked)} />
                  {t(`cat_${cat}`)}
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}
