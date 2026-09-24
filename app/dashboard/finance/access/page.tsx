'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor } from '@/lib/module-colors'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { intlLocale } from '@/lib/i18n/format-date'
import { SkeletonRows } from '@/components/ui/Skeleton'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Grant {
  id: string
  person_id: string
  scope: 'all' | 'journey'
  journey_id: string | null
  person_name: string | null
  journey_name: string | null
  created_at: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null, lang: string): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(intlLocale(lang), { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Page ──────────────────────────────────────────────────────────────────────
//
// Только просмотр. Решение владельца: доступ к финансам (как и любые права)
// выдаётся и снимается ТОЛЬКО в «אבטחת מידע» → вид по сотруднику. Здесь —
// список действующих грантов и ссылка на человека туда. Маршруты
// /api/finance/access остаются: ими пользуется «אבטחת מידע».

export default function FinanceAccessPage() {
  const t = useTranslations('finance.access')
  const tNav = useTranslations('navigation')
  const { lang } = useLang()

  const [grants, setGrants] = useState<Grant[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const primary = getModuleColor('finance', 'primary')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/access')
      if (res.status === 403) {
        setForbidden(true)
        setGrants([])
        return
      }
      if (!res.ok) {
        setError(t('load_error'))
        setGrants([])
        return
      }
      const body = await res.json()
      setForbidden(false)
      setGrants(body.grants ?? [])
    } catch {
      setError(t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

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
      <ModuleHeader module="finance" title={t('title')} subtitle={t('subtitle')} />

      {forbidden ? (
        <div style={{ fontSize: 13, color: 'var(--danger)' }}>{t('forbidden')}</div>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            {t('managed_in_data_security')}
          </p>

          {/* Grants list */}
          {error ? (
            <div style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</div>
          ) : loading ? (
            <SkeletonRows avatar={false} />
          ) : grants.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('empty')}</div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
              <table className="cards-sm" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>{t('col_person')}</th>
                    <th style={th}>{t('col_scope')}</th>
                    <th style={th}>{t('col_created')}</th>
                    <th style={{ ...th, textAlign: 'end' }}>{t('col_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {grants.map(g => (
                    <tr key={g.id}>
                      <td data-label={t('col_person')} style={{ ...td, fontWeight: 500 }}>{g.person_name || '—'}</td>
                      <td data-label={t('col_scope')} style={td}>
                        {g.scope === 'all'
                          ? <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 99, background: 'var(--surface-2)', color: primary, fontWeight: 600 }}>{t('scope_all')}</span>
                          : (g.journey_name || '—')}
                      </td>
                      <td data-label={t('col_created')} style={td}>{formatDate(g.created_at, lang)}</td>
                      <td data-label="" style={{ ...td, textAlign: 'end' }}>
                        <Link
                          href={`/dashboard/data-security?tab=person&person=${encodeURIComponent(g.person_id)}`}
                          style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-strong)', whiteSpace: 'nowrap' }}
                        >
                          {t('edit_in_data_security')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
