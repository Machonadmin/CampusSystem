'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { SkeletonRows } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { AUDITED_ENTITY_TYPES, AUDIT_ACTIONS, buildAuditDiff } from '@/lib/audit/query'

interface Entry {
  id: string
  entity_type: string
  entity_id: string
  action: 'create' | 'update' | 'delete'
  old_data: unknown
  new_data: unknown
  changed_fields: string[] | null
  changed_by: string | null
  changed_by_name: string | null
  changed_at: string
}

const PAGE = 50

export default function AuditLogClient() {
  const t = useTranslations('settings.audit')
  const tNav = useTranslations('navigation')
  const { lang, isRTL } = useLang()

  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [entityId, setEntityId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // Применённые фильтры (меняются по «Фильтровать») — чтобы список не дёргался
  // на каждое нажатие клавиши.
  const [applied, setApplied] = useState({ entityType: '', action: '', entityId: '', from: '', to: '' })

  const [entries, setEntries] = useState<Entry[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notMigrated, setNotMigrated] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async (nextOffset: number, replace: boolean) => {
    setLoading(true); setError(null)
    try {
      const p = new URLSearchParams({ limit: String(PAGE), offset: String(nextOffset) })
      if (applied.entityType) p.set('entity_type', applied.entityType)
      if (applied.action) p.set('action', applied.action)
      if (applied.entityId.trim()) p.set('entity_id', applied.entityId.trim())
      if (applied.from) p.set('from', applied.from)
      if (applied.to) p.set('to', applied.to)

      const res = await fetch(`/api/audit-log?${p.toString()}`)
      if (!res.ok) { setError(t('load_error')); return }
      const b = await res.json() as { entries?: Entry[]; total?: number; not_migrated?: boolean }
      setNotMigrated(b.not_migrated === true)
      setTotal(b.total ?? 0)
      setEntries(prev => replace ? (b.entries ?? []) : [...prev, ...(b.entries ?? [])])
      setOffset(nextOffset)
    } catch {
      setError(t('load_error'))
    } finally { setLoading(false) }
  }, [applied, t])

  useEffect(() => { load(0, true) }, [load])

  const fmtWhen = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-GB' : 'ru-RU', {
        dateStyle: 'short', timeStyle: 'short',
      }).format(new Date(iso))
    } catch { return iso }
  }

  const actionLabel = (a: string) =>
    a === 'create' ? t('action_create') : a === 'update' ? t('action_update') : t('action_delete')
  const actionColor = (a: string) =>
    a === 'create' ? 'var(--success)' : a === 'delete' ? 'var(--danger)' : 'var(--accent-strong)'
  const actionTint = (a: string) =>
    a === 'create' ? 'var(--success-tint)' : a === 'delete' ? 'var(--danger-tint)' : 'var(--accent-tint)'

  const inp: React.CSSProperties = {
    padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8,
    background: 'var(--surface)', color: 'var(--text)', outline: 'none',
  }

  const applyFilters = () => { setApplied({ entityType, action, entityId, from, to }); setOpenId(null) }
  const resetFilters = () => {
    setEntityType(''); setAction(''); setEntityId(''); setFrom(''); setTo('')
    setApplied({ entityType: '', action: '', entityId: '', from: '', to: '' }); setOpenId(null)
  }

  const stringify = (v: unknown) => {
    if (v === null || v === undefined) return '—'
    if (typeof v === 'string') return v || '—'
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    try { return JSON.stringify(v) } catch { return String(v) }
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('settings'), href: '/dashboard/settings' },
        { label: t('title') },
      ]} />

      <ModuleHeader module="settings" title={t('title')} subtitle={t('subtitle')} />

      {/* Только чтение + документированное ограничение по «кто» */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
          {t('read_only')}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn)', borderRadius: 8, padding: '8px 12px' }}>
          {t('unknown_actor_hint')}
        </div>
      </div>

      {/* Фильтры */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{t('entity_type')}</span>
          <select value={entityType} onChange={e => setEntityType(e.target.value)} style={inp}>
            <option value="">{t('all')}</option>
            {AUDITED_ENTITY_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{t('action')}</span>
          <select value={action} onChange={e => setAction(e.target.value)} style={inp}>
            <option value="">{t('all')}</option>
            {AUDIT_ACTIONS.map(a => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4, flex: 1, minWidth: 220 }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{t('entity_id')}</span>
          <input value={entityId} onChange={e => setEntityId(e.target.value)} placeholder="uuid" dir="ltr" style={inp} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{t('date_from')}</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{t('date_to')}</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp} />
        </label>
        <Button variant="primary" onClick={applyFilters}>{t('apply')}</Button>
        <Button onClick={resetFilters}>{t('reset')}</Button>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>{error}</div>
      )}
      {notMigrated && (
        <div style={{ padding: 12, background: 'var(--warn-tint)', color: 'var(--warn)', borderRadius: 8, fontSize: 13 }}>{t('not_migrated')}</div>
      )}

      {loading && entries.length === 0 ? <SkeletonRows rows={8} /> : entries.length === 0 ? (
        <EmptyState text={t('empty')} />
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
            {t('showing').replace('{n}', String(entries.length)).replace('{total}', String(total))}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
            {entries.map((e, i) => {
              const open = openId === e.id
              const diff = open ? buildAuditDiff(e) : []
              return (
                <div key={e.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <button
                    onClick={() => setOpenId(open ? null : e.id)}
                    aria-expanded={open}
                    style={{
                      display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', width: '100%',
                      padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'start', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)', minWidth: 120 }} dir="ltr">{fmtWhen(e.changed_at)}</span>
                    <span style={{
                      fontSize: 11.5, fontWeight: 700, color: actionColor(e.action), background: actionTint(e.action),
                      borderRadius: 999, padding: '2px 10px',
                    }}>{actionLabel(e.action)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }} dir="ltr">{e.entity_type}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)', fontFamily: 'monospace' }} dir="ltr">{e.entity_id.slice(0, 8)}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 12.5, color: e.changed_by_name ? 'var(--text)' : 'var(--text-faint)' }}>
                      {e.changed_by_name || t('unknown_actor')}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-strong)' }}>
                      {open ? t('collapse') : t('expand')}
                    </span>
                  </button>

                  {open && (
                    <div className="anim-expand" style={{ padding: '0 14px 12px', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 420 }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-2)' }}>
                            <th style={{ padding: '6px 10px', textAlign: isRTL ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 700 }}>{t('field')}</th>
                            <th style={{ padding: '6px 10px', textAlign: isRTL ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 700 }}>{t('before')}</th>
                            <th style={{ padding: '6px 10px', textAlign: isRTL ? 'right' : 'left', color: 'var(--text-muted)', fontWeight: 700 }}>{t('after')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diff.map(d => (
                            <tr key={d.field} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text)' }} dir="ltr">{d.field}</td>
                              <td style={{ padding: '6px 10px', color: 'var(--text-muted)', wordBreak: 'break-word' }} dir="auto">{stringify(d.before)}</td>
                              <td style={{ padding: '6px 10px', color: 'var(--text)', wordBreak: 'break-word' }} dir="auto">{stringify(d.after)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {entries.length < total && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Button onClick={() => load(offset + PAGE, false)} disabled={loading}>
                {t('load_more')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
