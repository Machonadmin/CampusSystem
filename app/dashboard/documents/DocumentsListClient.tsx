'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { downloadCsv } from '@/lib/csv'

interface Student {
  journey_id: string
  full_name: string
  hebrew_name: string | null
  email: string | null
  phones: string[]
  doc_count: number
  has_expired: boolean
  has_expiring_soon: boolean
}
interface ExpiringDoc {
  id: string
  journey_id: string
  doc_type: string
  title: string
  expiry_date: string | null
  student_name: string
  student_hebrew_name: string | null
  days_until: number | null
}

export default function DocumentsListClient({ canManage }: { canManage: boolean }) {
  const router = useRouter()
  const t = useTranslations('documents')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const light = getModuleColor('documents', 'light')

  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [expired, setExpired] = useState<ExpiringDoc[]>([])
  const [expiringSoon, setExpiringSoon] = useState<ExpiringDoc[]>([])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/documents/students')
      if (res.status === 403) { setError(t('list.forbidden')); setStudents([]); return }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('list.load_error')); setStudents([]); return
      }
      const b = await res.json()
      setStudents(b.students ?? [])
    } catch {
      setError(t('list.load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const loadExpiring = useCallback(async () => {
    try {
      const res = await fetch('/api/documents/expiring')
      if (!res.ok) return
      const b = await res.json()
      setExpired(b.expired ?? [])
      setExpiringSoon(b.expiring_soon ?? [])
    } catch { /* worklist остаётся пустым */ }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadExpiring() }, [loadExpiring])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter(s =>
      s.full_name.toLowerCase().includes(q) ||
      (s.hebrew_name ?? '').toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q) ||
      s.phones.join(' ').toLowerCase().includes(q)
    )
  }, [students, search])

  function go(journeyId: string) {
    router.push(`/dashboard/documents/${journeyId}`)
  }

  function exportCsv() {
    const headers = [t('list.student'), t('list.documents')]
    const data = filtered.map(s => {
      const parts: string[] = []
      if (s.doc_count > 0) parts.push(`${s.doc_count} ${t('list.count')}`)
      if (s.has_expired) parts.push(t('list.expired_flag'))
      if (s.has_expiring_soon) parts.push(t('list.expiring_flag'))
      return [s.full_name || s.hebrew_name || '', parts.join('; ') || '—']
    })
    downloadCsv('documents', [headers, ...data])
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('documents'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(107,114,128,0.15)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t('list.subtitle')}</div>
      </div>

      {/* Expiring worklist */}
      {(expired.length > 0 || expiringSoon.length > 0) && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>{t('expiring.title')}</h2>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <WorklistColumn
              heading={t('expiring.expired')}
              accent="#DC2626"
              items={expired}
              emptyLabel={t('expiring.none')}
              dueLabel={t('fields.expiry_date')}
              typeLabel={type => t(`types.${type}`)}
              onPick={go}
            />
            <WorklistColumn
              heading={t('expiring.expiring_soon')}
              accent="#B45309"
              items={expiringSoon}
              emptyLabel={t('expiring.none')}
              dueLabel={t('fields.expiry_date')}
              typeLabel={type => t(`types.${type}`)}
              onPick={go}
            />
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('list.search_placeholder')}
          style={{ flex: '1 1 260px', maxWidth: 420, fontSize: 13, padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' }}
        />
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          style={{ marginInlineStart: 'auto', fontSize: 13, fontWeight: 600, padding: '9px 14px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: filtered.length === 0 ? 'var(--text-faint)' : 'var(--text)', cursor: filtered.length === 0 ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
        >
          ⭳ {tCommon('export_csv')}
        </button>
      </div>

      {/* Students list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        {error ? (
          <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
        ) : loading ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('list.empty')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[t('list.student'), t('list.documents'), ''].map((h, i) => (
                    <th key={i} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr
                    key={s.journey_id}
                    onClick={() => go(s.journey_id)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface)' }}
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>{s.full_name || s.hebrew_name || '—'}</div>
                      {s.email && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{s.email}</div>}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {s.doc_count > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: light, color: 'var(--text-muted)' }}>
                            {s.doc_count} · {t('list.count')}
                          </span>
                        )}
                        {s.has_expired && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: '#FEE2E2', color: '#B91C1C' }}>
                            {t('list.expired_flag')}
                          </span>
                        )}
                        {s.has_expiring_soon && (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: '#FEF3C7', color: '#B45309' }}>
                            {t('list.expiring_flag')}
                          </span>
                        )}
                        {s.doc_count === 0 && (
                          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>—</span>
                        )}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span aria-hidden style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-faint)' }}>‹</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canManage && (
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('list.manage_hint')}</div>
      )}
    </div>
  )
}

function WorklistColumn({
  heading, accent, items, emptyLabel, dueLabel, typeLabel, onPick,
}: {
  heading: string
  accent: string
  items: ExpiringDoc[]
  emptyLabel: string
  dueLabel: string
  typeLabel: (type: string) => string
  onPick: (journeyId: string) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {heading} · {items.length}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{emptyLabel}</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {items.map(f => (
            <button
              key={f.id}
              onClick={() => onPick(f.journey_id)}
              style={{
                textAlign: 'start', background: 'var(--surface-2)', border: '1px solid var(--surface-2)',
                borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                {f.student_name || f.student_hebrew_name || '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                {typeLabel(f.doc_type)} · {f.title}
              </div>
              <div style={{ fontSize: 11, color: accent, marginTop: 2 }}>
                {dueLabel}: {f.expiry_date}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
  textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '9px 12px', borderBottom: '1px solid var(--surface-2)' }
