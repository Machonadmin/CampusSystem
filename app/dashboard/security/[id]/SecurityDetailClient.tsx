'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { allowedTransitions } from '@/lib/security/incidents'
import { SEVERITIES } from '@/lib/security/validation'

interface Incident {
  id: string
  title: string
  description: string | null
  occurred_at: string
  building_id: string | null
  location_text: string | null
  category: string
  severity: string
  status: string
  reported_by: string | null
  assigned_to: string | null
  resolution: string | null
  resolved_at: string | null
  building_name: string | null
}

interface Props {
  incidentId: string
  incidentTitle: string
  canManage: boolean
  currentPersonId: string
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open:          { bg: '#DBEAFE', fg: '#1D4ED8' },
  investigating: { bg: '#FEF3C7', fg: '#B45309' },
  resolved:      { bg: '#D1FAE5', fg: '#047857' },
  closed:        { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
}
const SEVERITY_COLORS: Record<string, { bg: string; fg: string }> = {
  critical: { bg: '#FEE2E2', fg: '#B91C1C' },
  high:     { bg: '#FFEDD5', fg: '#C2410C' },
  medium:   { bg: '#FEF3C7', fg: '#B45309' },
  low:      { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export default function SecurityDetailClient({ incidentId, incidentTitle, canManage, currentPersonId }: Props) {
  const t = useTranslations('security')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('security', 'primary')

  const [incident, setIncident] = useState<Incident | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [resolutionDraft, setResolutionDraft] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/security/incidents/${incidentId}`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('detail.load_error')); return
      }
      const b = await res.json() as Incident
      setIncident(b)
      setResolutionDraft(b.resolution ?? '')
    } catch {
      setError(t('detail.load_error'))
    } finally {
      setLoading(false)
    }
  }, [incidentId, t])

  useEffect(() => { load() }, [load])

  async function patch(payload: Record<string, unknown>) {
    setBusy(true); setActionError(null)
    try {
      const res = await fetch(`/api/security/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setActionError(b.error ?? t('detail.action_error')); return
      }
      const b = await res.json() as Incident
      setIncident(b)
      setResolutionDraft(b.resolution ?? '')
    } catch {
      setActionError(t('detail.action_error'))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Переход статуса. При переходе в resolved несём вместе текст разрешения из
   * черновика (resolve with resolution text), для прочих переходов — только статус.
   */
  function transitionTo(to: string) {
    if (to === 'resolved') patch({ status: to, resolution: resolutionDraft.trim() || null })
    else patch({ status: to })
  }

  const sc = incident ? STATUS_COLORS[incident.status] ?? STATUS_COLORS.closed : STATUS_COLORS.closed
  const vc = incident ? SEVERITY_COLORS[incident.severity] ?? SEVERITY_COLORS.low : SEVERITY_COLORS.low
  const transitions = incident ? allowedTransitions(incident.status) : []

  const locationParts: string[] = []
  if (incident?.building_name) locationParts.push(incident.building_name)
  if (incident?.location_text) locationParts.push(incident.location_text)
  const locationLabel = locationParts.join(' · ') || '—'

  const assignedToMe = !!incident?.assigned_to && incident.assigned_to === currentPersonId

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('security'), href: '/dashboard/security' },
        { label: incidentTitle || '—' },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('security'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(220,38,38,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{incident?.title || incidentTitle}</h1>
        </div>
        <Link href="/dashboard/security" style={{ fontSize: 13, color: '#fff', opacity: 0.9, textDecoration: 'underline' }}>
          {tCommon('back')}
        </Link>
      </div>

      {error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      ) : loading || !incident ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : (
        <>
          {actionError && <div style={{ fontSize: 13, color: '#DC2626' }}>{actionError}</div>}

          {/* Meta card */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge label={t(`severity.${incident.severity}`)} colors={vc} />
              <Badge label={t(`status.${incident.status}`)} colors={sc} />
              <Badge label={t(`category.${incident.category}`)} colors={{ bg: 'var(--surface-2)', fg: 'var(--text)' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <Field label={t('detail.location')} value={locationLabel} />
              <Field label={t('detail.occurred_at')} value={fmtDate(incident.occurred_at)} />
              <Field label={t('detail.resolved_at')} value={fmtDate(incident.resolved_at)} />
              <Field label={t('detail.assignee')} value={incident.assigned_to ? (assignedToMe ? t('detail.you') : incident.assigned_to) : t('detail.unassigned')} />
            </div>

            {incident.description && (
              <div>
                <div style={fieldLabelStyle}>{t('detail.description')}</div>
                <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{incident.description}</div>
              </div>
            )}

            {incident.resolution && (
              <div>
                <div style={fieldLabelStyle}>{t('detail.resolution')}</div>
                <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{incident.resolution}</div>
              </div>
            )}
          </div>

          {/* Actions */}
          {canManage && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'grid', gap: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('detail.actions')}</div>

              {/* Status transitions */}
              <div>
                <div style={fieldLabelStyle}>{t('detail.change_status')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                  {transitions.length === 0 ? (
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('detail.no_actions')}</span>
                  ) : transitions.map(to => (
                    <button key={to} onClick={() => transitionTo(to)} disabled={busy} style={outlineBtn(primary)}>
                      {t(`status.${to}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Severity */}
              <div>
                <div style={fieldLabelStyle}>{t('detail.set_severity')}</div>
                <select
                  value={incident.severity}
                  onChange={e => patch({ severity: e.target.value })}
                  disabled={busy}
                  style={{ marginTop: 6, fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)', width: 180 }}
                >
                  {SEVERITIES.map(s => <option key={s} value={s}>{t(`severity.${s}`)}</option>)}
                </select>
              </div>

              {/* Assign */}
              <div>
                <div style={fieldLabelStyle}>{t('detail.assign')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                  {assignedToMe ? (
                    <button onClick={() => patch({ assigned_to: null })} disabled={busy} style={outlineBtn('var(--text-muted)')}>
                      {t('detail.unassign')}
                    </button>
                  ) : (
                    <button onClick={() => patch({ assigned_to: currentPersonId })} disabled={busy} style={outlineBtn(primary)}>
                      {t('detail.assign_to_me')}
                    </button>
                  )}
                </div>
              </div>

              {/* Resolution editor */}
              <div>
                <div style={fieldLabelStyle}>{t('detail.resolution')}</div>
                <textarea
                  value={resolutionDraft}
                  onChange={e => setResolutionDraft(e.target.value)}
                  rows={3}
                  placeholder={t('detail.resolution_placeholder')}
                  style={{ marginTop: 6, width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit' }}
                />
                <div style={{ marginTop: 6 }}>
                  <button
                    onClick={() => patch({ resolution: resolutionDraft })}
                    disabled={busy || resolutionDraft === (incident.resolution ?? '')}
                    style={btn(primary)}
                  >
                    {tCommon('save')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={fieldLabelStyle}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 3 }}>{value}</div>
    </div>
  )
}

function Badge({ label, colors }: { label: string; colors: { bg: string; fg: string } }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: colors.bg, color: colors.fg, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5,
}
function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}
function outlineBtn(color: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '6px 14px', border: `1px solid ${color}`, borderRadius: 8, background: 'var(--surface)', color, cursor: 'pointer' }
}
