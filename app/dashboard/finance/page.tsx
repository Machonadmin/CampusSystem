'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinanceStudent {
  journey_id: string
  person_id: string
  full_name: string
  hebrew_name: string | null
  email: string | null
  phones: string[]
  photo_url: string | null
  charges_total: number
  payments_total: number
  balance: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '—'
}

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const router = useRouter()
  const t = useTranslations('finance')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [items, setItems] = useState<FinanceStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/students')
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
      setItems(body.students ?? [])
    } catch {
      setError(t('list.load_error'))
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
        (s.email ?? '').toLowerCase().includes(q))
    : items

  const primary = getModuleColor('finance', 'primary')

  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px',
    borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
  }
  const thNum: React.CSSProperties = { ...th, textAlign: 'right' }
  const td: React.CSSProperties = { fontSize: 13, color: '#1F2937', padding: '10px 12px', borderBottom: '1px solid #F3F4F6' }
  const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('finance') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('finance'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(5,150,105,0.15)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{tNav('finance')}</h1>
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
                <th style={thNum}>{t('list.col_charges')}</th>
                <th style={thNum}>{t('list.col_payments')}</th>
                <th style={thNum}>{t('list.col_balance')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                // balance > 0 → студент должен (красный); ≤ 0 → оплачено/переплата (зелёный)
                const owes = s.balance > 0.005
                return (
                  <tr
                    key={s.journey_id}
                    onClick={() => router.push(`/dashboard/finance/${s.journey_id}`)}
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
                            ? <img src={s.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : initials(s.full_name)}
                        </div>
                        <span style={{ fontWeight: 500 }}>{s.full_name || '—'}</span>
                      </div>
                    </td>
                    <td style={tdNum}>{fmtMoney(s.charges_total)}</td>
                    <td style={tdNum}>{fmtMoney(s.payments_total)}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: owes ? '#DC2626' : '#059669' }}>
                      {fmtMoney(s.balance)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
