'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { ListToolbar, ListSearchInput } from '@/components/ui/ListToolbar'
import EmptyState from '@/components/ui/EmptyState'
import PageActionButton from '@/components/ui/PageActionButton'
import AlumniFormModal from '@/components/alumni/AlumniFormModal'

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

  const [items, setItems] = useState<AlumniItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // «+ בוגרת חדשה» — только с alumni.manage (сервер присылает can_manage).
  const [canManage, setCanManage] = useState(false)
  const [creating, setCreating] = useState(false)
  // Клик по строке сразу открывает карточку (owner: лишний слой раскрытия убран).

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
      setCanManage(body.can_manage === true)
    } catch {
      setError(t('list.load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  // Поиск по тем же полям, что и сервер (?search): имя, email, телефон,
  // подразделение и направление.
  const q = search.trim().toLowerCase()
  const filtered = q
    ? items.filter(a =>
        a.full_name.toLowerCase().includes(q) ||
        (a.hebrew_name ?? '').toLowerCase().includes(q) ||
        (a.email ?? '').toLowerCase().includes(q) ||
        a.phones.join(' ').toLowerCase().includes(q) ||
        (a.institution ?? '').toLowerCase().includes(q) ||
        (a.direction ?? '').toLowerCase().includes(q))
    : items

  const primary = getModuleColor('alumni', 'primary')
  const light = getModuleColor('alumni', 'light')

  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '10px 12px', borderBottom: '1px solid var(--surface-2)' }

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <ModuleHeader
        breadcrumb={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('alumni') },
      ]} module="alumni" title={tNav('alumni')} subtitle={t('list.subtitle')}
        actions={canManage ? (
          <PageActionButton label={t('list.add')} icon={<span aria-hidden="true">+</span>} onClick={() => setCreating(true)} />
        ) : undefined}
      />

      {creating && (
        <AlumniFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={journeyId => { setCreating(false); router.push(`/dashboard/alumni/${journeyId}`) }}
        />
      )}

      {/* Поиск, счётчик под ним (общая шапка списков). */}
      <ListToolbar
        search={<ListSearchInput value={search} onChange={setSearch} placeholder={t('list.search_placeholder')} />}
        count={`${t('list.count')}: ${filtered.length}`}
      />

      {/* Body */}
      {error ? (
        <div style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</div>
      ) : loading ? (
        <SkeletonRows avatar={false} rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState module="alumni" text={t('list.empty')} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }} />
      ) : (
        <div className="anim-rise" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
          <table className="cards-sm" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('list.col_name')}</th>
                <th style={th}>{t('list.col_graduation_year')}</th>
                <th style={th}>{t('list.col_institution')}</th>
                <th style={th}>{t('list.col_direction')}</th>
                <th style={th}>{t('list.col_occupation')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                return (
                  <tr
                    key={a.journey_id}
                    onClick={() => router.push(`/dashboard/alumni/${a.journey_id}`)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                  >
                    <td data-label={t('list.col_name')} style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                          background: light, color: primary,
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
                    <td data-label={t('list.col_graduation_year')} style={td}>{a.graduation_year ?? '—'}</td>
                    <td data-label={t('list.col_institution')} style={td}>{a.institution || '—'}</td>
                    <td data-label={t('list.col_direction')} style={td}>{a.direction || '—'}</td>
                    <td data-label={t('list.col_occupation')} style={td}>{a.current_occupation || '—'}</td>
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

