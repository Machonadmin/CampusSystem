'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import CreateCheckModal from './components/CreateCheckModal'
import TemplatesTab from './components/TemplatesTab'
import { hasFeatureAccess } from '@/lib/permissions'
import ModuleTabs from '@/components/ui/ModuleTabs'
import PageActionButton from '@/components/ui/PageActionButton'
import type { FeatureAccess, FeaturePerms } from '@/lib/permissions'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface CheckRow {
  id: string
  lesson_date: string
  lesson_time: string
  teacher_person_id: string
  teacher_name: string | null
  observer_person_id: string
  observer_name: string | null
  group_name: string | null
  course_name: string | null
  template_name: string | null
  status: string
  overall_rating: number | null
  completed_at: string | null
}

const STATUS_COLOR: Record<string, [string, string]> = {
  planned:     ['var(--accent-tint)', 'var(--accent)'],
  in_progress: ['#FFFBEB', '#D97706'],
  completed:   ['#F0FDF4', '#16A34A'],
}

const NO_PERMS: FeaturePerms = { can_view: false, can_create: false, can_edit: false, can_delete: false }

function StatusBadge({ status, t }: { status: string; t: (key: string, fallback?: string) => string }) {
  const [bg, color] = STATUS_COLOR[status] ?? ['var(--surface-2)', 'var(--text-muted)']
  return (
    <span style={{ padding: '2px 10px', borderRadius: 20, backgroundColor: bg, color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {t(`status.${status}`, status)}
    </span>
  )
}

function RatingStars({ rating }: { rating: number | null }) {
  if (rating === null) return <span style={{ color: 'var(--border-strong)', fontSize: 12 }}>—</span>
  return (
    <span style={{ fontSize: 13, color: '#F59E0B', fontWeight: 700 }}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
      <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11, marginLeft: 4 }}>{rating}/5</span>
    </span>
  )
}

type Tab = 'planned' | 'history' | 'templates'

export default function QualityControlPage() {
  const t = useTranslations('quality')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const [featureAccess, setFeatureAccess] = useState<FeatureAccess>({})
  const [tab, setTab] = useState<Tab>('planned')
  const [checks, setChecks] = useState<CheckRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : {})
      .then((data: { feature_access?: FeatureAccess }) => { if (data.feature_access) setFeatureAccess(data.feature_access) })
  }, [])

  const canViewPlanned   = hasFeatureAccess(featureAccess, 'quality_control', 'planned',   'can_view')
  const canViewHistory   = hasFeatureAccess(featureAccess, 'quality_control', 'history',   'can_view')
  const canViewTemplates = hasFeatureAccess(featureAccess, 'quality_control', 'templates', 'can_view')
  const canCreateCheck   = hasFeatureAccess(featureAccess, 'quality_control', 'planned',   'can_create')

  const templatePerms: FeaturePerms = featureAccess?.quality_control?.templates ?? NO_PERMS

  const load = useCallback(async () => {
    if (tab === 'templates') return
    setLoading(true)
    try {
      const params = new URLSearchParams({ tab })
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/quality-control?${params}`)
      if (res.ok) setChecks(await res.json())
    } finally {
      setLoading(false)
    }
  }, [tab, search, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string, date: string) {
    if (!confirm(t('list.confirm_delete', 'Delete check from {date}?').replace('{date}', date))) return
    setDeletingId(id)
    try {
      await fetch(`/api/quality-control/${id}`, { method: 'DELETE' })
      setRefresh(r => r + 1)
    } finally {
      setDeletingId(null)
    }
  }

  function formatDate(d: string) {
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    } catch { return d }
  }

  const tabs: { key: Tab; label: string; visible: boolean }[] = [
    { key: 'planned',   label: t('list.tab_planned'),   visible: canViewPlanned },
    { key: 'history',   label: t('list.tab_history'),   visible: canViewHistory },
    { key: 'templates', label: t('list.tab_templates'), visible: canViewTemplates },
  ]

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />

      {/* Page header */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: getModuleHeaderGradient('quality_control'),
          padding: '12px 24px',
          boxShadow: '0 2px 8px rgba(236,72,153,0.2)',
        }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff', margin: 0 }}>{t('title')}</h1>
      </div>

      {/* Tabs */}
      <ModuleTabs
        tabs={tabs}
        active={tab}
        onChange={k => setTab(k as Tab)}
        accentColor={getModuleColor('quality_control')}
      />

      {/* Content */}
      <div style={{ backgroundColor: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Templates tab */}
        {tab === 'templates' && (
          <TemplatesTab perms={templatePerms} />
        )}

        {/* Checks tabs */}
        {tab !== 'templates' && (
          <>
            {/* Search toolbar */}
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid var(--surface-2)', backgroundColor: 'var(--surface-2)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('list.search_placeholder')}
                style={{ padding: '7px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, outline: 'none', width: 280 }}
              />
              <div style={{ flex: 1 }} />
              {canCreateCheck && (
                <PageActionButton
                  label={t('list.new_check_button')}
                  onClick={() => setShowCreate(true)}
                  accentColor={getModuleColor('quality_control')}
                />
              )}
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              {loading ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{tCommon('loading')}</div>
              ) : checks.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                  {tab === 'planned' ? t('list.no_planned') : t('list.no_history')}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--surface-2)' }}>
                      {[t('list.table_date_time'), t('list.table_teacher'), t('list.table_group_course'), t('list.table_observer'), t('list.table_status'), t('list.table_rating'), t('list.table_actions')].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'start', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {checks.map((c, i) => (
                      <tr key={c.id} style={{ borderTop: '1px solid var(--surface-2)', backgroundColor: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{formatDate(c.lesson_date)}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{c.lesson_time.slice(0, 5)}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontSize: 13, color: 'var(--text)' }}>{c.teacher_name ?? '—'}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {c.group_name && <div style={{ fontSize: 13, color: 'var(--text)' }}>{c.group_name}</div>}
                          {c.course_name && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{c.course_name}</div>}
                          {!c.group_name && !c.course_name && <span style={{ color: 'var(--border-strong)', fontSize: 13 }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontSize: 13, color: 'var(--text)' }}>{c.observer_name ?? '—'}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <StatusBadge status={c.status} t={t} />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <RatingStars rating={c.overall_rating} />
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Link
                              href={`/dashboard/quality-control/${c.id}`}
                              style={{
                                padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 5, textDecoration: 'none',
                                border: c.status === 'completed' ? '1px solid var(--border-strong)' : '1px solid #BFDBFE',
                                background: c.status === 'completed' ? 'var(--surface-2)' : 'var(--accent-tint)',
                                color: c.status === 'completed' ? 'var(--text)' : '#1D4ED8',
                              }}
                            >
                              {c.status === 'completed' ? t('list.action_view') : t('list.action_fill')}
                            </Link>
                            <button
                              onClick={() => handleDelete(c.id, formatDate(c.lesson_date))}
                              disabled={deletingId === c.id}
                              style={{ padding: '4px 10px', fontSize: 11, border: '1px solid #FEE2E2', borderRadius: 5, background: '#FEF2F2', cursor: 'pointer', color: '#DC2626', fontWeight: 600, opacity: deletingId === c.id ? 0.5 : 1 }}
                            >
                              {tCommon('delete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateCheckModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setRefresh(r => r + 1) }}
        />
      )}
    </div>
  )
}
