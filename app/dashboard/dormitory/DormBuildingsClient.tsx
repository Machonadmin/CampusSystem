'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Building {
  id: string
  name: string
  code: string | null
  gender: 'male' | 'female' | 'mixed'
  address: string | null
  is_active: boolean
  rooms_count: number
  total_capacity: number
  occupied: number
  free: number
}

export default function DormBuildingsClient({ canManage }: { canManage: boolean }) {
  const router = useRouter()
  const t = useTranslations('dormitory')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [items, setItems] = useState<Building[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | 'mixed'>('mixed')
  const [address, setAddress] = useState('')

  const primary = getModuleColor('dormitory', 'primary')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dormitory/buildings')
      if (res.status === 403) { setError(t('list.forbidden')); setItems([]); return }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('list.load_error')); setItems([]); return
      }
      const b = await res.json()
      setItems(b.buildings ?? [])
    } catch {
      setError(t('list.load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  async function submit() {
    if (!name.trim()) { setFormError(t('form.required')); return }
    setBusy(true); setFormError(null)
    try {
      const res = await fetch('/api/dormitory/buildings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), code: code.trim() || null, gender, address: address.trim() || null }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setFormError(b.error ?? t('form.save_error')); return
      }
      setName(''); setCode(''); setGender('mixed'); setAddress(''); setShowForm(false)
      await load()
    } catch {
      setFormError(t('form.save_error'))
    } finally {
      setBusy(false)
    }
  }

  const genderLabel = (g: string) => t(`gender.${g}`)

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('dormitory') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('dormitory'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(6,182,212,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{tNav('dormitory')}</h1>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('list.subtitle')}</div>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(v => !v)} style={{
            fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.15)',
            color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            + {t('list.add_building')}
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && canManage && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('form.name')} style={inp(200)} />
          <input value={code} onChange={e => setCode(e.target.value)} placeholder={t('form.code')} style={inp(120)} />
          <select value={gender} onChange={e => setGender(e.target.value as 'male' | 'female' | 'mixed')} style={inp(140)}>
            <option value="mixed">{t('gender.mixed')}</option>
            <option value="male">{t('gender.male')}</option>
            <option value="female">{t('gender.female')}</option>
          </select>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder={t('form.address')} style={inp(240)} />
          <button onClick={submit} disabled={busy} style={btn(primary)}>{tCommon('save')}</button>
          {formError && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{formError}</span>}
        </div>
      )}

      {/* Body */}
      {error ? (
        <div style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('list.empty')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {items.map(b => (
            <div
              key={b.id}
              onClick={() => router.push(`/dashboard/dormitory/${b.id}`)}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = primary }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{b.name}</div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: getModuleColor('dormitory', 'light'), color: primary }}>
                  {genderLabel(b.gender)}
                </span>
              </div>
              {b.code && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{b.code}</div>}

              <OccupancyBar occupied={b.occupied} capacity={b.total_capacity} color={primary} />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                <span>{t('list.rooms')}: {b.rooms_count}</span>
                <span>{t('list.occupied')}: {b.occupied} / {b.total_capacity}</span>
                <span style={{ color: b.free > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{t('list.free')}: {b.free}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── shared bits ───────────────────────────────────────────────────────────────

export function OccupancyBar({ occupied, capacity, color }: { occupied: number; capacity: number; color: string }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0
  const full = capacity > 0 && occupied >= capacity
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: full ? 'var(--danger)' : color, transition: 'width 0.2s ease' }} />
      </div>
    </div>
  )
}

function inp(width: number): React.CSSProperties {
  return { width, fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' }
}
function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}
