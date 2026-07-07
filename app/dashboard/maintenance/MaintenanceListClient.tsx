'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { CATEGORIES, PRIORITIES, STATUSES } from '@/lib/maintenance/validation'

interface Ticket {
  id: string
  title: string
  description: string | null
  building_id: string | null
  room_id: string | null
  location_text: string | null
  category: string
  priority: string
  status: string
  assigned_to: string | null
  reported_at: string
  building_name: string | null
  room_number: string | null
  is_overdue: boolean
}
interface LocationBuilding {
  id: string
  name: string
  code: string | null
  rooms: { id: string; room_number: string; floor: number | null }[]
}
interface Stats {
  status_counts: Record<string, number>
  total_overdue: number
  total: number
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open:        { bg: '#DBEAFE', fg: '#1D4ED8' },
  in_progress: { bg: '#FEF3C7', fg: '#B45309' },
  resolved:    { bg: '#D1FAE5', fg: '#047857' },
  closed:      { bg: '#F3F4F6', fg: '#6B7280' },
  cancelled:   { bg: '#FEE2E2', fg: '#B91C1C' },
}
const PRIORITY_COLORS: Record<string, { bg: string; fg: string }> = {
  urgent: { bg: '#FEE2E2', fg: '#B91C1C' },
  high:   { bg: '#FFEDD5', fg: '#C2410C' },
  normal: { bg: '#DBEAFE', fg: '#1D4ED8' },
  low:    { bg: '#F3F4F6', fg: '#6B7280' },
}

export default function MaintenanceListClient({ canManage }: { canManage: boolean }) {
  const router = useRouter()
  const t = useTranslations('maintenance')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('maintenance', 'primary')

  const [items, setItems] = useState<Ticket[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // filters
  const [fStatus, setFStatus] = useState('')
  const [fPriority, setFPriority] = useState('')

  // create form
  const [locations, setLocations] = useState<LocationBuilding[]>([])
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [locationText, setLocationText] = useState('')
  const [category, setCategory] = useState('other')
  const [priority, setPriority] = useState('normal')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (fStatus) qs.set('status', fStatus)
      if (fPriority) qs.set('priority', fPriority)
      const res = await fetch(`/api/maintenance/requests${qs.toString() ? `?${qs}` : ''}`)
      if (res.status === 403) { setError(t('list.forbidden')); setItems([]); return }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('list.load_error')); setItems([]); return
      }
      const b = await res.json()
      setItems(b.requests ?? [])
    } catch {
      setError(t('list.load_error'))
    } finally {
      setLoading(false)
    }
  }, [fStatus, fPriority, t])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/maintenance/stats')
      if (res.ok) setStats(await res.json())
    } catch { /* сводка не критична */ }
  }, [])

  const loadLocations = useCallback(async () => {
    try {
      const res = await fetch('/api/maintenance/locations')
      if (res.ok) {
        const b = await res.json()
        setLocations(b.buildings ?? [])
      }
    } catch { /* пикер не критичен */ }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadStats(); loadLocations() }, [loadStats, loadLocations])

  const selectedBuilding = locations.find(b => b.id === buildingId) ?? null

  async function submit() {
    if (!title.trim()) { setFormError(t('form.required')); return }
    setBusy(true); setFormError(null)
    try {
      const res = await fetch('/api/maintenance/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          building_id: buildingId || null,
          room_id: roomId || null,
          location_text: locationText.trim() || null,
          category,
          priority,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setFormError(b.error ?? t('form.save_error')); return
      }
      setTitle(''); setDescription(''); setBuildingId(''); setRoomId(''); setLocationText('')
      setCategory('other'); setPriority('normal'); setShowForm(false)
      await load(); await loadStats()
    } catch {
      setFormError(t('form.save_error'))
    } finally {
      setBusy(false)
    }
  }

  function locationLabel(r: Ticket): string {
    const parts: string[] = []
    if (r.building_name) parts.push(r.building_name)
    if (r.room_number) parts.push(`${t('form.room')} ${r.room_number}`)
    if (r.location_text) parts.push(r.location_text)
    return parts.join(' · ') || '—'
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('maintenance') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('maintenance'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(146,64,14,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{tNav('maintenance')}</h1>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('list.subtitle')}</div>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(v => !v)} style={{
            fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.15)',
            color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            + {t('list.new_ticket')}
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
              value={stats.status_counts[s] ?? 0}
              colors={STATUS_COLORS[s]}
            />
          ))}
          {stats.total_overdue > 0 && (
            <SummaryPill
              label={t('list.overdue')}
              value={stats.total_overdue}
              colors={{ bg: '#FEE2E2', fg: '#B91C1C' }}
              strong
            />
          )}
        </div>
      )}

      {/* Create form */}
      {showForm && canManage && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16, display: 'grid', gap: 10 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('form.title')} style={inp()} />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('form.description')} rows={2} style={area} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <select value={buildingId} onChange={e => { setBuildingId(e.target.value); setRoomId('') }} style={sel(190)}>
              <option value="">{t('form.select_building')}</option>
              {locations.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={roomId} onChange={e => setRoomId(e.target.value)} disabled={!selectedBuilding} style={sel(150)}>
              <option value="">{t('form.select_room')}</option>
              {(selectedBuilding?.rooms ?? []).map(r => <option key={r.id} value={r.id}>{r.room_number}</option>)}
            </select>
            <input value={locationText} onChange={e => setLocationText(e.target.value)} placeholder={t('form.location_text')} style={inp(200)} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <select value={category} onChange={e => setCategory(e.target.value)} style={sel(160)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{t(`category.${c}`)}</option>)}
            </select>
            <select value={priority} onChange={e => setPriority(e.target.value)} style={sel(140)}>
              {PRIORITIES.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
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
        <select value={fPriority} onChange={e => setFPriority(e.target.value)} style={sel(150)}>
          <option value="">{t('list.filter_priority')}</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
        </select>
      </div>

      {/* Body */}
      {error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{tCommon('loading')}</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('list.empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(r => {
            const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.closed
            const pc = PRIORITY_COLORS[r.priority] ?? PRIORITY_COLORS.low
            return (
              <div
                key={r.id}
                onClick={() => router.push(`/dashboard/maintenance/${r.id}`)}
                style={{
                  background: r.is_overdue ? '#FEF2F2' : '#fff',
                  border: '1px solid #E5E7EB',
                  borderInlineStart: `4px solid ${r.is_overdue ? '#DC2626' : pc.fg}`,
                  borderRadius: 10, padding: '12px 16px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = primary; (e.currentTarget as HTMLDivElement).style.borderInlineStartColor = r.is_overdue ? '#DC2626' : pc.fg }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#E5E7EB'; (e.currentTarget as HTMLDivElement).style.borderInlineStartColor = r.is_overdue ? '#DC2626' : pc.fg }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{r.title}</span>
                    {r.is_overdue && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C', letterSpacing: '0.04em' }}>
                        {t('list.overdue')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>
                    {t(`category.${r.category}`)} · {locationLabel(r)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <Badge label={t(`priority.${r.priority}`)} colors={pc} />
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

function Badge({ label, colors }: { label: string; colors: { bg: string; fg: string } }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: colors.bg, color: colors.fg, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function inp(width?: number): React.CSSProperties {
  return { width: width ?? '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937' }
}
function sel(width: number): React.CSSProperties {
  return { width, fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937', background: '#fff' }
}
function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}
const area: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937', resize: 'vertical', fontFamily: 'inherit' }
