'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'

interface Settings {
  rollover_month: number
  rollover_day: number
  auto_enabled: boolean
  last_rolled_year: number | null
}

const accent = getModuleColor('education')

export default function YearRolloverTab() {
  const t = useTranslations('education.study')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const resp = await fetch('/api/education/year-rollover')
      if (!resp.ok) throw new Error(t('common.error_generic'))
      const json = await resp.json()
      setSettings(json.settings ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_unknown'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!settings) return
    setSaving(true)
    try {
      const resp = await fetch('/api/education/year-rollover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          rollover_month: settings.rollover_month,
          rollover_day: settings.rollover_day,
          auto_enabled: settings.auto_enabled,
        }),
      })
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); toast(e.error ?? t('common.error_generic'), 'error'); return }
      const json = await resp.json()
      setSettings(json.settings ?? settings)
      toast(t('rollover.saved'), 'success')
    } finally { setSaving(false) }
  }

  async function runNow() {
    if (!confirm(t('rollover.run_confirm'))) return
    setRunning(true)
    try {
      const resp = await fetch('/api/education/year-rollover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run' }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) { toast(json.error ?? t('common.error_generic'), 'error'); return }
      if (json.ran) {
        toast(t('rollover.run_done').replace('{promoted}', String(json.promoted)).replace('{graduated}', String(json.graduated)), 'success')
      } else {
        toast(t('rollover.run_skipped'), 'info')
      }
      load()
    } finally { setRunning(false) }
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }
  const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none' }

  if (loading) return <div style={{ padding: 24, color: 'var(--text-faint)', fontSize: 13 }}>{t('common.loading')}</div>
  if (error) return <div style={{ padding: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>{error}</div>
  if (!settings) return <div style={{ padding: 24, color: 'var(--text-faint)', fontSize: 13 }}>{t('rollover.not_ready')}</div>

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-faint)' }}>{t('rollover.hint')}</p>

      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
          <input type="checkbox" checked={settings.auto_enabled} onChange={e => setSettings({ ...settings, auto_enabled: e.target.checked })} />
          {t('rollover.auto_enabled')}
        </label>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={lbl}>{t('rollover.month')}</label>
            <select style={inp} value={settings.rollover_month} onChange={e => setSettings({ ...settings, rollover_month: Number(e.target.value) })}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>{t('rollover.day')}</label>
            <select style={inp} value={settings.rollover_day} onChange={e => setSettings({ ...settings, rollover_day: Number(e.target.value) })}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <button
            onClick={save}
            disabled={saving}
            style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff', background: accent, border: 'none', borderRadius: 8, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {settings.last_rolled_year
            ? t('rollover.last_run').replace('{year}', String(settings.last_rolled_year))
            : t('rollover.never_run')}
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={runNow}
          disabled={running}
          style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: running ? 'wait' : 'pointer', opacity: running ? 0.6 : 1 }}
        >
          {running ? t('common.saving') : t('rollover.run_now')}
        </button>
      </div>
    </div>
  )
}
