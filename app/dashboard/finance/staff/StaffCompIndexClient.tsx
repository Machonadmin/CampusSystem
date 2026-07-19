'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import PageActionButton from '@/components/ui/PageActionButton'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StaffItem {
  person_id: string
  full_name: string
  hebrew_name: string | null
  position: string | null
  department: string | null
  email: string | null
  photo_url: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '—'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StaffCompIndexClient() {
  const router = useRouter()
  const t = useTranslations('finance.staff')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const tCh = useTranslations('chavruta')

  const [items, setItems] = useState<StaffItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const primary = getModuleColor('finance', 'primary')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/persons/staff?pageSize=200')
      if (res.status === 403) {
        setError(t('forbidden'))
        setItems([])
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? t('load_error'))
        setItems([])
        return
      }
      const body = await res.json()
      setItems(body.staff ?? [])
    } catch {
      setError(t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? items.filter(s =>
        s.full_name.toLowerCase().includes(q) ||
        (s.hebrew_name ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        (s.position ?? '').toLowerCase().includes(q))
    : items

  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '10px 12px', borderBottom: '1px solid var(--surface-2)' }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('finance'), href: '/dashboard/finance' },
        { label: t('title') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('finance'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(5,150,105,0.15)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('subtitle')}</div>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('search_placeholder')}
          style={{
            flex: 1, maxWidth: 360, fontSize: 13, padding: '8px 12px',
            border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {t('count')}: {filtered.length}
        </span>
        <PageActionButton
          label={tCh('manage_teachers_link')}
          onClick={() => router.push('/dashboard/finance/staff/chavruta')}
          accentColor={primary}
          icon="👥"
          style={{ marginInlineStart: 'auto' }}
        />
      </div>

      {/* Body */}
      {error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('empty')}</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('col_name')}</th>
                <th style={th}>{t('col_department')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr
                  key={s.person_id}
                  onClick={() => router.push(`/dashboard/finance/staff/${s.person_id}`)}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#ECFDF5' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                >
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                        background: '#D1FAE5', color: primary,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                      }}>
                        {s.photo_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={s.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : initials(s.full_name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>{s.full_name || '—'}</div>
                        {s.position && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{s.position}</div>}
                      </div>
                    </div>
                  </td>
                  <td style={td}>{s.department ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
