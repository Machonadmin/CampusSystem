'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { allowedTransitions } from '@/lib/maintenance/tickets'
import { PRIORITIES } from '@/lib/maintenance/validation'

interface Ticket {
  id: string
  title: string
  description: string | null
  building_id: string | null
  room_id: string | null
  location_text: string | null
  category: string
  priority: string
  status: string
  reported_by: string | null
  assigned_to: string | null
  assigned_to_name?: string | null
  reported_at: string
  resolved_at: string | null
  building_name: string | null
  room_number: string | null
  is_overdue: boolean
}

interface Props {
  ticketId: string
  ticketTitle: string
  canManage: boolean
  currentPersonId: string
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open:        { bg: '#DBEAFE', fg: '#1D4ED8' },
  in_progress: { bg: '#FEF3C7', fg: '#B45309' },
  resolved:    { bg: '#D1FAE5', fg: '#047857' },
  closed:      { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
  cancelled:   { bg: '#FEE2E2', fg: '#B91C1C' },
}
const PRIORITY_COLORS: Record<string, { bg: string; fg: string }> = {
  urgent: { bg: '#FEE2E2', fg: '#B91C1C' },
  high:   { bg: '#FFEDD5', fg: '#C2410C' },
  normal: { bg: '#DBEAFE', fg: '#1D4ED8' },
  low:    { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export default function MaintenanceDetailClient({ ticketId, ticketTitle, canManage, currentPersonId }: Props) {
  const t = useTranslations('maintenance')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('maintenance', 'primary')

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [descDraft, setDescDraft] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/maintenance/requests/${ticketId}`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('detail.load_error')); return
      }
      const b = await res.json() as Ticket
      setTicket(b)
      setDescDraft(b.description ?? '')
    } catch {
      setError(t('detail.load_error'))
    } finally {
      setLoading(false)
    }
  }, [ticketId, t])

  useEffect(() => { load() }, [load])

  async function patch(payload: Record<string, unknown>) {
    setBusy(true); setActionError(null)
    try {
      const res = await fetch(`/api/maintenance/requests/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setActionError(b.error ?? t('detail.action_error')); return
      }
      const b = await res.json() as Ticket
      setTicket(b)
      setDescDraft(b.description ?? '')
    } catch {
      setActionError(t('detail.action_error'))
    } finally {
      setBusy(false)
    }
  }

  const sc = ticket ? STATUS_COLORS[ticket.status] ?? STATUS_COLORS.closed : STATUS_COLORS.closed
  const pc = ticket ? PRIORITY_COLORS[ticket.priority] ?? PRIORITY_COLORS.low : PRIORITY_COLORS.low
  const transitions = ticket ? allowedTransitions(ticket.status) : []

  const locationParts: string[] = []
  if (ticket?.building_name) locationParts.push(ticket.building_name)
  if (ticket?.room_number) locationParts.push(`${t('detail.room')} ${ticket.room_number}`)
  if (ticket?.location_text) locationParts.push(ticket.location_text)
  const locationLabel = locationParts.join(' · ') || '—'

  const assignedToMe = !!ticket?.assigned_to && ticket.assigned_to === currentPersonId

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('maintenance'), href: '/dashboard/maintenance' },
        { label: ticketTitle || '—' },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('maintenance'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(146,64,14,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{ticket?.title || ticketTitle}</h1>
          {ticket?.is_overdue && (
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, letterSpacing: '0.04em' }}>{t('list.overdue')}</div>
          )}
        </div>
        <Link href="/dashboard/maintenance" style={{ fontSize: 13, color: '#fff', opacity: 0.9, textDecoration: 'underline' }}>
          {tCommon('back')}
        </Link>
      </div>

      {error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      ) : loading || !ticket ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : (
        <>
          {actionError && <div style={{ fontSize: 13, color: '#DC2626' }}>{actionError}</div>}

          {/* Meta card */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge label={t(`status.${ticket.status}`)} colors={sc} />
              <Badge label={t(`priority.${ticket.priority}`)} colors={pc} />
              <Badge label={t(`category.${ticket.category}`)} colors={{ bg: 'var(--surface-2)', fg: 'var(--text)' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <Field label={t('detail.location')} value={locationLabel} />
              <Field label={t('detail.reported_at')} value={fmtDate(ticket.reported_at)} />
              <Field label={t('detail.resolved_at')} value={fmtDate(ticket.resolved_at)} />
              <Field label={t('detail.assignee')} value={ticket.assigned_to ? (assignedToMe ? t('detail.you') : (ticket.assigned_to_name || t('detail.assigned_other'))) : t('detail.unassigned')} />
            </div>

            {ticket.description && (
              <div>
                <div style={fieldLabelStyle}>{t('detail.description')}</div>
                <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{ticket.description}</div>
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
                    <button key={to} onClick={() => patch({ status: to })} disabled={busy} style={outlineBtn(primary)}>
                      {t(`status.${to}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div>
                <div style={fieldLabelStyle}>{t('detail.set_priority')}</div>
                <select
                  value={ticket.priority}
                  onChange={e => patch({ priority: e.target.value })}
                  disabled={busy}
                  style={{ marginTop: 6, fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)', width: 180 }}
                >
                  {PRIORITIES.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
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

              {/* Description editor */}
              <div>
                <div style={fieldLabelStyle}>{t('detail.description')}</div>
                <textarea
                  value={descDraft}
                  onChange={e => setDescDraft(e.target.value)}
                  rows={3}
                  style={{ marginTop: 6, width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit' }}
                />
                <div style={{ marginTop: 6 }}>
                  <button
                    onClick={() => patch({ description: descDraft })}
                    disabled={busy || descDraft === (ticket.description ?? '')}
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
