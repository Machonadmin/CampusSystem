'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AlumniItem {
  journey_id: string
  person_id: string
  full_name: string
  hebrew_name: string | null
  email: string | null
  phones: string[]
  photo_url: string | null
  alumni_profile_id: string | null
  graduation_year: number | null
  institution: string | null
  direction: string | null
  current_location: string | null
  current_occupation: string | null
  notes: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '—'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AlumniPage() {
  const router = useRouter()
  const t = useTranslations('alumni')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [items, setItems] = useState<AlumniItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/alumni')
      if (res.status === 403) {
        setError(t('list.forbidden'))
        setItems([])
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? t('list.load_error'))
        setItems([])
        return
      }
      const body = await res.json()
      setItems(body.alumni ?? [])
    } catch {
      setError(t('list.load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? items.filter(a =>
        a.full_name.toLowerCase().includes(q) ||
        (a.hebrew_name ?? '').toLowerCase().includes(q) ||
        (a.email ?? '').toLowerCase().includes(q) ||
        (a.institution ?? '').toLowerCase().includes(q) ||
        (a.direction ?? '').toLowerCase().includes(q))
    : items

  const primary = getModuleColor('alumni', 'primary')

  const th: React.CSSProperties = {
    textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px',
    borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { fontSize: 13, color: '#1F2937', padding: '10px 12px', borderBottom: '1px solid #F3F4F6' }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('alumni') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('alumni'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(219,39,119,0.15)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{tNav('alumni')}</h1>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('list.subtitle')}</div>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('list.search_placeholder')}
          style={{
            flex: 1, maxWidth: 360, fontSize: 13, padding: '8px 12px',
            border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937',
          }}
        />
        <span style={{ fontSize: 12, color: '#9CA3AF' }}>
          {t('list.count')}: {filtered.length}
        </span>
      </div>

      {/* Body */}
      {error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{tCommon('loading')}</div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('list.empty')}</div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('list.col_name')}</th>
                <th style={th}>{t('list.col_graduation_year')}</th>
                <th style={th}>{t('list.col_institution')}</th>
                <th style={th}>{t('list.col_direction')}</th>
                <th style={th}>{t('list.col_occupation')}</th>
                <th style={th}>{t('list.col_location')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr
                  key={a.journey_id}
                  onClick={() => router.push(`/dashboard/alumni/${a.journey_id}`)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#FCF2F8' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                >
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                        background: '#FCE7F3', color: primary,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {a.photo_url
                          ? <img src={a.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : initials(a.full_name)}
                      </div>
                      <span style={{ fontWeight: 500 }}>{a.full_name || '—'}</span>
                    </div>
                  </td>
                  <td style={td}>{a.graduation_year ?? '—'}</td>
                  <td style={td}>{a.institution || '—'}</td>
                  <td style={td}>{a.direction || '—'}</td>
                  <td style={td}>{a.current_occupation || '—'}</td>
                  <td style={td}>{a.current_location || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
