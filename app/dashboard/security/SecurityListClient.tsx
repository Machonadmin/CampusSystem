'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { DownloadIcon } from '@/components/ui/DownloadIcon'
import { downloadCsv } from '@/lib/csv'
import { CATEGORIES, SEVERITIES, STATUSES } from '@/lib/security/validation'

interface Incident {
  id: string
  title: string
  description: string | null
  occurred_at: string
  building_id: string | null
  location_text: string | null
  category: string
  severity: string
  status: string
  assigned_to: string | null
  building_name: string | null
}
interface BuildingOption {
  id: string
  name: string
  code: string | null
}
interface Stats {
  total: number
  open: number
  investigating: number
  resolved: number
  closed: number
  active: number
  by_severity: Record<string, number>
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open:          { bg: '#DBEAFE', fg: '#1D4ED8' },
  investigating: { bg: '#FEF3C7', fg: '#B45309' },
  resolved:      { bg: '#D1FAE5', fg: '#047857' },
  closed:        { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
}
const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
  critical: { bg: '#FEE2E2', fg: '#B91C1C' },
  high:     { bg: '#FFEDD5', fg: '#C2410C' },
  medium:   { bg: '#FEF3C7', fg: '#B45309' },
  low:      { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
}

/** Критичность, требующая визуального акцента (красная рамка/фон строки). */
function isProminent(severity: string): boolean {
  return severity === 'critical' || severity === 'high'
}

export default function SecurityListClient({ canManage }: { canManage: boolean }) {
  const router = useRouter()
  const t = useTranslations('security')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('security', 'primary')

  const [items, setItems] = useState<Incident[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // filters
  const [fStatus, setFStatus] = useState('')
  const [fSeverity, setFSeverity] = useState('')
  const [fCategory, setFCategory] = useState('')

  // create form
  const [buildings, setBuildings] = useState<BuildingOption[]>([])
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [locationText, setLocationText] = useState('')
  const [category, setCategory] = useState('other')
  const [severity, setSeverity] = useState('medium')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (fStatus) qs.set('status', fStatus)
      if (fSeverity) qs.set('severity', fSeverity)
      if (fCategory) qs.set('category', fCategory)
      const res = await fetch(`/api/security/incidents${qs.toString() ? `?${qs}` : ''}`)
      if (res.status === 403) { setError(t('list.forbidden')); setItems([]); return }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('list.load_error')); setItems([]); return
      }
      const b = await res.json()
      setItems(b.incidents ?? [])
    } catch {
      setError(t('list.load_error'))
    } finally {
      setLoading(false)
    }
  }, [fStatus, fSeverity, fCategory, t])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/security/stats')
      if (res.ok) setStats(await res.json())
    } catch { /* сводка не критична */ }
  }, [])

  const loadBuildings = useCallback(async () => {
    try {
      const res = await fetch('/api/security/buildings')
      if (res.ok) {
        const b = await res.json()
        setBuildings(b.buildings ?? [])
      }
    } catch { /* пикер не критичен */ }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadStats(); loadBuildings() }, [loadStats, loadBuildings])

  async function submit() {
    if (!title.trim()) { setFormError(t('form.required')); return }
    setBusy(true); setFormError(null)
    try {
      let occurredIso: string | null = null
      if (occurredAt) {
        const d = new Date(occurredAt)
        if (!Number.isNaN(d.getTime())) occurredIso = d.toISOString()
      }
      const res = await fetch('/api/security/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          occurred_at: occurredIso,
          building_id: buildingId || null,
          location_text: locationText.trim() || null,
          category,
          severity,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setFormError(b.error ?? t('form.save_error')); return
      }
      setTitle(''); setDescription(''); setOccurredAt(''); setBuildingId(''); setLocationText('')
      setCategory('other'); setSeverity('medium'); setShowForm(false)
      await load(); await loadStats()
    } catch {
      setFormError(t('form.save_error'))
    } finally {
      setBusy(false)
    }
  }

  function locationLabel(r: Incident): string {
    const parts: string[] = []
    if (r.building_name) parts.push(r.building_name)
    if (r.location_text) parts.push(r.location_text)
    return parts.join(' · ') || '—'
  }

  function fmtDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString()
  }

  function exportCsv() {
    const headers = [t('form.title'), t('list.filter_category'), t('detail.location'), t('detail.occurred_at'), t('detail.set_severity'), t('list.filter_status')]
    const data = items.map(r => [
      r.title,
      t(`category.${r.category}`),
      locationLabel(r),
      fmtDate(r.occurred_at),
      t(`severity.${r.severity}`),
      t(`status.${r.status}`),
    ])
    downloadCsv('security', [headers, ...data])
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('security') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('security'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(220,38,38,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{tNav('security')}</h1>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('list.subtitle')}</div>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(v => !v)} style={{
            fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.15)',
            color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            + {t('list.new_incident')}
          </button>
        )}
      </div>

      {/* Summary bar */}
      {stats && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {STATUSES.map(s => (
            <SummaryPill
              key={s}
              label={t(`status.${s}`)}
              value={stats[s as 'open' | 'investigating' | 'resolved' | 'closed'] ?? 0}
              colors={STATUS_COLORS[s]}
            />
          ))}
          {stats.active > 0 && (
            <SummaryPill
              label={t('list.active')}
              value={stats.active}
              colors={{ bg: '#FEE2E2', fg: '#B91C1C' }}
              strong
            />
          )}
          {(stats.by_severity?.critical ?? 0) > 0 && (
            <SummaryPill
              label={t('severity.critical')}
              value={stats.by_severity.critical}
              colors={SEVERITY_COLORS.critical}
              strong
            />
          )}
        </div>
      )}

      {/* Create form */}
      {showForm && canManage && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'grid', gap: 10 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('form.title')} style={inp()} />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('form.description')} rows={2} style={area} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {t('form.occurred_at')}
              <input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} style={sel(210)} />
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <select value={buildingId} onChange={e => setBuildingId(e.target.value)} style={sel(190)}>
              <option value="">{t('form.select_building')}</option>
              {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input value={locationText} onChange={e => setLocationText(e.target.value)} placeholder={t('form.location_text')} style={inp(200)} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <select value={category} onChange={e => setCategory(e.target.value)} style={sel(170)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{t(`category.${c}`)}</option>)}
            </select>
            <select value={severity} onChange={e => setSeverity(e.target.value)} style={sel(150)}>
              {SEVERITIES.map(s => <option key={s} value={s}>{t(`severity.${s}`)}</option>)}
            </select>
            <button onClick={submit} disabled={busy} style={btn(primary)}>{tCommon('save')}</button>
            {formError && <span style={{ fontSize: 12, color: '#DC2626' }}>{formError}</span>}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={sel(150)}>
          <option value="">{t('list.filter_status')}</option>
          {STATUSES.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
        </select>
        <select value={fSeverity} onChange={e => setFSeverity(e.target.value)} style={sel(150)}>
          <option value="">{t('list.filter_severity')}</option>
          {SEVERITIES.map(s => <option key={s} value={s}>{t(`severity.${s}`)}</option>)}
        </select>
        <select value={fCategory} onChange={e => setFCategory(e.target.value)} style={sel(170)}>
          <option value="">{t('list.filter_category')}</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{t(`category.${c}`)}</option>)}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={items.length === 0}
          style={{ marginInlineStart: 'auto', fontSize: 13, fontWeight: 600, padding: '7px 14px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: items.length === 0 ? 'var(--text-faint)' : 'var(--text)', cursor: items.length === 0 ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
        >
          <DownloadIcon /> {tCommon('export_csv')}
        </button>
      </div>

      {/* Body */}
      {error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('list.empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(r => {
            const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.closed
            const vc = SEVERITY_COLORS[r.severity] ?? SEVERITY_COLORS.low
            const prominent = isProminent(r.severity)
            return (
              <div
                key={r.id}
                onClick={() => router.push(`/dashboard/security/${r.id}`)}
                style={{
                  background: prominent ? '#FEF2F2' : 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderInlineStart: `4px solid ${vc.fg}`,
                  borderRadius: 10, padding: '12px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = primary; (e.currentTarget as HTMLDivElement).style.borderInlineStartColor = vc.fg }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.borderInlineStartColor = vc.fg }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{r.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    {t(`category.${r.category}`)} · {locationLabel(r)} · {fmtDate(r.occurred_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <Badge label={t(`severity.${r.severity}`)} colors={vc} strong={prominent} />
                  <Badge label={t(`status.${r.status}`)} colors={sc} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SummaryPill({ label, value, colors, strong }: { label: string; value: number; colors: { bg: string; fg: string }; strong?: boolean }) {
  return (
    <span style={{
      fontSize: 12, fontWeight: strong ? 700 : 600, padding: '5px 12px', borderRadius: 999,
      background: colors.bg, color: colors.fg, display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {label}
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </span>
  )
}

function Badge({ label, colors, strong }: { label: string; colors: { bg: string; fg: string }; strong?: boolean }) {
  return (
    <span style={{ fontSize: 11, fontWeight: strong ? 700 : 600, padding: '2px 9px', borderRadius: 999, background: colors.bg, color: colors.fg, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function inp(width?: number): React.CSSProperties {
  return { width: width ?? '100%', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' }
}
function sel(width: number): React.CSSProperties {
  return { width, fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)' }
}
function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}
const area: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit' }
