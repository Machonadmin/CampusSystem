'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { PersonSelect } from '@/components/ui/person-select'
import { toast } from '@/components/ui/toast'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

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

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinanceAccessPage() {
  const t = useTranslations('finance.access')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [grants, setGrants] = useState<Grant[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [personId, setPersonId] = useState<string | null>(null)
  const [granting, setGranting] = useState(false)

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

  async function grantAll() {
    if (!personId || granting) return
    setGranting(true)
    try {
      const res = await fetch('/api/finance/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, scope: 'all' }),
      })
      if (!res.ok) {
        toast(t('grant_failed'), 'error')
        return
      }
      toast(t('granted'), 'success')
      setPersonId(null)
      await load()
    } catch {
      toast(t('grant_failed'), 'error')
    } finally {
      setGranting(false)
    }
  }

  async function revoke(id: string) {
    if (!window.confirm(t('revoke_confirm'))) return
    try {
      const res = await fetch(`/api/finance/access/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast(t('grant_failed'), 'error')
        return
      }
      await load()
    } catch {
      toast(t('grant_failed'), 'error')
    }
  }

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

      {forbidden ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{t('forbidden')}</div>
      ) : (
        <>
          {/* Add global access */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              {t('grant_all_title')}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <PersonSelect
                  value={personId}
                  onChange={id => setPersonId(id)}
                  placeholder={t('pick_employee')}
                  accentColor={primary}
                />
              </div>
              <button
                onClick={grantAll}
                disabled={!personId || granting}
                style={{
                  fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: primary, color: '#fff',
                  cursor: !personId || granting ? 'default' : 'pointer',
                  opacity: !personId || granting ? 0.5 : 1,
                }}
              >
                {t('grant_all_button')}
              </button>
            </div>
          </div>

          {/* Grants list */}
          {error ? (
            <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
          ) : loading ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
          ) : grants.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('empty')}</div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                      <td style={{ ...td, fontWeight: 500 }}>{g.person_name || '—'}</td>
                      <td style={td}>
                        {g.scope === 'all'
                          ? <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 99, background: 'var(--surface-2)', color: primary, fontWeight: 600 }}>{t('scope_all')}</span>
                          : (g.journey_name || '—')}
                      </td>
                      <td style={td}>{formatDate(g.created_at)}</td>
                      <td style={{ ...td, textAlign: 'end' }}>
                        <button
                          onClick={() => revoke(g.id)}
                          style={{
                            fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7,
                            background: 'var(--surface)', color: '#DC2626',
                            border: '1px solid var(--border-strong)', cursor: 'pointer',
                          }}
                        >
                          {t('revoke')}
                        </button>
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
