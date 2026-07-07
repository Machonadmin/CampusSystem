'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Student {
  journey_id: string
  full_name: string
  hebrew_name: string | null
  email: string | null
  phones: string[]
  open_sessions: number
  risk_level: string
}
interface FollowUp {
  id: string
  journey_id: string
  session_date: string
  follow_up_date: string | null
  summary: string | null
  student_name: string
  student_hebrew_name: string | null
  days_until: number | null
}

// Цвета бейджа уровня риска (none — бейдж не показывается).
const RISK_STYLE: Record<string, { bg: string; color: string }> = {
  low:    { bg: '#E0E7FF', color: '#3730A3' },
  medium: { bg: '#FEF3C7', color: '#B45309' },
  high:   { bg: '#FEE2E2', color: '#B91C1C' },
}

export default function PsychologistListClient({ canManage }: { canManage: boolean }) {
  const router = useRouter()
  const t = useTranslations('psychologist')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('psychologist', 'primary')
  const light = getModuleColor('psychologist', 'light')

  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [upcoming, setUpcoming] = useState<FollowUp[]>([])
  const [overdue, setOverdue] = useState<FollowUp[]>([])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/psychologist/students')
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

  const loadFollowups = useCallback(async () => {
    try {
      const res = await fetch('/api/psychologist/followups')
      if (!res.ok) return
      const b = await res.json()
      setUpcoming(b.upcoming ?? [])
      setOverdue(b.overdue ?? [])
    } catch { /* worklist остаётся пустым */ }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadFollowups() }, [loadFollowups])

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
    router.push(`/dashboard/psychologist/${journeyId}`)
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('psychologist'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(124,58,237,0.15)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t('list.subtitle')}</div>
      </div>

      {/* Follow-ups worklist — для управляющих */}
      {canManage && (upcoming.length > 0 || overdue.length > 0) && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>{t('followups.title')}</h2>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <WorklistColumn
              heading={t('followups.overdue')}
              accent="#DC2626"
              items={overdue}
              emptyLabel={t('followups.none')}
              dueLabel={t('followups.follow_up')}
              onPick={go}
            />
            <WorklistColumn
              heading={t('followups.upcoming')}
              accent={primary}
              items={upcoming}
              emptyLabel={t('followups.none')}
              dueLabel={t('followups.follow_up')}
              onPick={go}
            />
          </div>
        </div>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('list.search_placeholder')}
        style={{ width: '100%', maxWidth: 420, fontSize: 13, padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937' }}
      />

      {/* Students list */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
        {error ? (
          <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
        ) : loading ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>{tCommon('loading')}</div>
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('list.empty')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[t('list.student'), t('list.status'), ''].map((h, i) => (
                    <th key={i} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const risk = RISK_STYLE[s.risk_level]
                  return (
                    <tr
                      key={s.journey_id}
                      onClick={() => go(s.journey_id)}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#fff' }}
                    >
                      <td style={td}>
                        <div style={{ fontWeight: 500, color: '#1F2937' }}>{s.full_name || s.hebrew_name || '—'}</div>
                        {s.email && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{s.email}</div>}
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {s.open_sessions > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: light, color: '#6D28D9' }}>
                              {s.open_sessions} · {t('list.open_sessions')}
                            </span>
                          )}
                          {risk && (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: risk.bg, color: risk.color }}>
                              {t('risk.label')}: {t(`risk.${s.risk_level}`)}
                            </span>
                          )}
                          {s.open_sessions === 0 && !risk && (
                            <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: primary }}>{t('list.open_card')}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function WorklistColumn({
  heading, accent, items, emptyLabel, dueLabel, onPick,
}: {
  heading: string
  accent: string
  items: FollowUp[]
  emptyLabel: string
  dueLabel: string
  onPick: (journeyId: string) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {heading} · {items.length}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: '#9CA3AF' }}>{emptyLabel}</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {items.map(f => (
            <button
              key={f.id}
              onClick={() => onPick(f.journey_id)}
              style={{
                textAlign: 'start', background: '#F9FAFB', border: '1px solid #F3F4F6',
                borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>
                {f.student_name || f.student_hebrew_name || '—'}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                {dueLabel}: {f.follow_up_date}
                {f.summary ? ` · ${f.summary}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9CA3AF',
  textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px',
  borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { fontSize: 13, color: '#1F2937', padding: '9px 12px', borderBottom: '1px solid #F3F4F6' }
