'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'

interface Target { id: string; name: string }
interface Req {
  id: string; owner_name: string; subject: string; status: string
  proposed_starts_at: string | null; proposed_ends_at: string | null
  response_note: string | null; created_at: string
  meeting: { starts_at: string; ends_at: string; status: string } | null
}

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  pending: { bg: 'var(--warn-tint)', fg: 'var(--warn)' },
  proposed: { bg: 'var(--info-tint)', fg: 'var(--info)' },
  approved: { bg: 'var(--success-tint)', fg: 'var(--success)' },
  declined: { bg: 'var(--danger-tint)', fg: 'var(--danger)' },
  cancelled: { bg: 'var(--surface-2)', fg: 'var(--text-faint)' },
}

const d10 = (s: string | null | undefined) => (s ?? '').slice(0, 10)
const t5 = (s: string | null | undefined) => (s ?? '').slice(11, 16)

/**
 * Портал студентки: «בקשה לפגישה» — попросить встречу у того, чей календарь
 * ведёт секретарь, и ответить на предложенное время. Если адресатов нет
 * (никому не назначен секретарь) — блок не показывается.
 */
export default function MeetingRequestPanel() {
  const t = useTranslations('meetings_mgr')
  const { lang } = useLang()
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [reqs, setReqs] = useState<Req[]>([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ owner: '', subject: '', details: '', preferred: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/portal/meeting-requests', { cache: 'no-store' })
      if (!r.ok) { setTargets([]); return }
      const b = await r.json()
      setTargets(b.targets ?? [])
      setReqs(b.requests ?? [])
      setF(x => ({ ...x, owner: x.owner || (b.targets?.[0]?.id ?? '') }))
    } catch { setTargets([]) }
  }, [])
  useEffect(() => { load() }, [load])

  async function submit() {
    setErr('')
    if (!f.subject.trim()) { setErr(t('err_subject')); return }
    setBusy(true)
    try {
      const r = await fetch('/api/portal/meeting-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: f.owner, subject: f.subject, details: f.details, preferred_times: f.preferred }),
      })
      if (!r.ok) { const b = await r.json().catch(() => ({})); setErr(b.error ?? t('action_failed')); return }
      setF({ owner: f.owner, subject: '', details: '', preferred: '' })
      setOpen(false)
      await load()
    } finally { setBusy(false) }
  }

  async function act(id: string, action: string) {
    setBusy(true); setErr('')
    try {
      const r = await fetch(`/api/portal/meeting-requests/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      if (!r.ok) { const b = await r.json().catch(() => ({})); setErr(b.error ?? t('action_failed')); return }
      await load()
    } finally { setBusy(false) }
  }

  if (!targets || (targets.length === 0 && reqs.length === 0)) return null

  const inp: React.CSSProperties = { padding: '7px 9px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('portal_title')}</h3>
        {targets.length > 0 && !open && (
          <button onClick={() => setOpen(true)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer' }}>+ {t('new_request')}</button>
        )}
      </div>

      {open && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12, padding: 10, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          {targets.length > 1 && (
            <select aria-label={t('request_to')} style={inp} value={f.owner} onChange={e => setF({ ...f, owner: e.target.value })}>
              {targets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          {targets.length === 1 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{t('request_to')} {targets[0].name}</div>}
          <input aria-label={t('subject')} style={inp} placeholder={t('subject')} value={f.subject} maxLength={300} onChange={e => setF({ ...f, subject: e.target.value })} />
          <textarea aria-label={t('details')} style={{ ...inp, minHeight: 60 }} placeholder={t('details')} value={f.details} maxLength={4000} onChange={e => setF({ ...f, details: e.target.value })} />
          <input aria-label={t('preferred_times')} style={inp} placeholder={t('preferred_times_hint')} value={f.preferred} maxLength={500} onChange={e => setF({ ...f, preferred: e.target.value })} />
          {err && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={submit} disabled={busy} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent-strong)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>{t('send_request')}</button>
            <button onClick={() => { setOpen(false); setErr('') }} style={{ fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>{t('cancel')}</button>
          </div>
        </div>
      )}

      {err && !open && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{err}</div>}

      {reqs.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('no_my_requests')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {reqs.map(r => {
            const c = STATUS_COLOR[r.status] ?? STATUS_COLOR.cancelled
            return (
              <div key={r.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.subject}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{r.owner_name} · {formatDate(d10(r.created_at), lang)}</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', background: c.bg, color: c.fg }}>{t(`req_status_${r.status}`)}</span>
                </div>
                {r.status === 'approved' && r.meeting && (
                  <div style={{ fontSize: 12.5, marginTop: 6 }}>{t('meeting_set_for')} {formatDate(d10(r.meeting.starts_at), lang)} {t5(r.meeting.starts_at)}–{t5(r.meeting.ends_at)}</div>
                )}
                {r.status === 'proposed' && r.proposed_starts_at && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 12.5 }}>{t('proposed_time')}: {formatDate(d10(r.proposed_starts_at), lang)} {t5(r.proposed_starts_at)}–{t5(r.proposed_ends_at)}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button onClick={() => act(r.id, 'accept_proposal')} disabled={busy} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--accent-strong)', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>{t('accept_proposal')}</button>
                      <button onClick={() => act(r.id, 'decline_proposal')} disabled={busy} style={{ fontSize: 12, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>{t('decline_proposal')}</button>
                    </div>
                  </div>
                )}
                {r.response_note && <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>{r.response_note}</div>}
                {r.status === 'pending' && (
                  <button onClick={() => act(r.id, 'cancel')} disabled={busy} style={{ fontSize: 11.5, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>{t('cancel_request')}</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
