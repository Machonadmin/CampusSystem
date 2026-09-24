'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import { SkeletonRows } from '@/components/ui/Skeleton'

const accent = getModuleColor('finance')

interface Settings { default_year_tuition: number; default_semester_tuition: number; currency: string; default_discount_percent: number }
interface Approval { id: string; requested_percent: number; status: string; note: string | null; journey: { person: { full_name: string | null; hebrew_name: string | null } | null } | null }

export default function FinanceAdminClient() {
  const t = useTranslations('education.finance_admin')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [canEditSettings, setCanEditSettings] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, aRes] = await Promise.all([
        fetch('/api/finance/settings'),
        fetch('/api/finance/discount-approvals?status=pending'),
      ])
      if (sRes.ok) { const b = await sRes.json(); setSettings(b.settings) } else if (sRes.status === 403) { setCanEditSettings(false) }
      if (aRes.ok) { const b = await aRes.json(); setApprovals(b.approvals ?? []) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const saveSettings = async () => {
    if (!settings) return
    setBusy(true)
    try {
      const res = await fetch('/api/finance/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_year_tuition: Number(settings.default_year_tuition),
          default_semester_tuition: Number(settings.default_semester_tuition),
          currency: settings.currency,
          default_discount_percent: Number(settings.default_discount_percent),
        }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(res.status === 403 ? t('settings_forbidden') : (b.error ?? t('action_failed')), 'error'); return }
      toast(t('saved'), 'success')
    } finally { setBusy(false) }
  }

  const syncOverdue = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/finance/overdue-alerts/sync', { method: 'POST' })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('action_failed'), 'error'); return }
      const b = await res.json()
      toast(t('sync_result').replace('{created}', String(b.created ?? 0)).replace('{overdue}', String(b.overdue ?? 0)), 'success')
    } finally { setBusy(false) }
  }

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(true)
    try {
      const res = await fetch(`/api/finance/discount-approvals/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(res.status === 403 ? t('approve_forbidden') : (b.error ?? t('action_failed')), 'error'); return }
      load()
    } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', width: 140 }
  const pname = (a: Approval) => a.journey?.person?.hebrew_name || a.journey?.person?.full_name || '—'

  if (loading) return <SkeletonRows rows={5} />

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      {/* Дефолты платы */}
      {settings && (
        <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px', color: 'var(--text)' }}>{t('defaults_title')}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>{t('defaults_hint')}</p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, color: 'var(--text)' }}>{t('year_price')}</span>
              <input type="number" min={0} value={settings.default_year_tuition} disabled={!canEditSettings} onChange={e => setSettings({ ...settings, default_year_tuition: Number(e.target.value) })} style={inp} /></label>
            <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, color: 'var(--text)' }}>{t('sem_price')}</span>
              <input type="number" min={0} value={settings.default_semester_tuition} disabled={!canEditSettings} onChange={e => setSettings({ ...settings, default_semester_tuition: Number(e.target.value) })} style={inp} /></label>
            <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, color: 'var(--text)' }}>{t('currency')}</span>
              <input value={settings.currency} disabled={!canEditSettings} onChange={e => setSettings({ ...settings, currency: e.target.value })} style={{ ...inp, width: 80 }} /></label>
            <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, color: 'var(--text)' }}>{t('discount_pct')}</span>
              <input type="number" min={0} max={100} value={settings.default_discount_percent} disabled={!canEditSettings} onChange={e => setSettings({ ...settings, default_discount_percent: Number(e.target.value) })} style={{ ...inp, width: 90 }} /></label>
            {canEditSettings && <button onClick={saveSettings} disabled={busy} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>{t('save')}</button>}
          </div>
        </section>
      )}

      {/* Просрочки → оповещения */}
      <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px', color: 'var(--text)' }}>{t('overdue_title')}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{t('overdue_hint')}</p>
        </div>
        <button onClick={syncOverdue} disabled={busy} style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>{t('sync_overdue')}</button>
      </section>

      {/* Утверждение скидок */}
      <section style={{ display: 'grid', gap: 8 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text)' }}>{t('discounts_title')}</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{t('discounts_hint')}</p>
        {approvals.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('discounts_empty')}</div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
            {approvals.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{pname(a)}</span>
                <span style={{ fontSize: 12, color: 'var(--accent-strong)', background: 'var(--accent-tint)', borderRadius: 999, padding: '2px 10px' }}>{a.requested_percent}%</span>
                {a.note && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.note}</span>}
                <div style={{ flex: 1 }} />
                <button disabled={busy} onClick={() => decide(a.id, 'approved')} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--success)', border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>{t('approve')}</button>
                <button disabled={busy} onClick={() => decide(a.id, 'rejected')} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--danger)', border: 'none', borderRadius: 7, padding: '5px 12px', cursor: 'pointer' }}>{t('reject')}</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
