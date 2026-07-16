'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'

interface Meeting {
  id: string; title: string; reason: string | null; starts_at: string; ends_at: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  provider: { full_name: string | null; hebrew_name: string | null } | null
}

const STATUS_COLOR: Record<Meeting['status'], { bg: string; fg: string }> = {
  scheduled: { bg: 'var(--accent-tint)', fg: 'var(--accent-strong)' },
  completed: { bg: 'var(--success-tint)', fg: 'var(--success)' },
  cancelled: { bg: 'var(--surface-2)', fg: 'var(--text-faint)' },
  no_show: { bg: 'var(--warn-tint)', fg: 'var(--warn)' },
}

/**
 * Панель встреч студентки (§5): назначить встречу, увидеть список, отметить
 * «выполнено»/«отменить». Питается journeys/[id]/meetings (таблица appointments).
 */
export default function MeetingsPanel({ journeyId, canEdit = true }: { journeyId: string; canEdit?: boolean }) {
  const t = useTranslations('education.meetings')
  const { lang } = useLang()

  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ title: '', date: '', time: '', dur: '30', reason: '' })

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/meetings`)
      if (res.ok) { const b = await res.json(); setMeetings(b.meetings ?? []) }
    } catch { /* silent */ } finally { setLoaded(true) }
  }, [journeyId])
  useEffect(() => { load() }, [load])

  async function schedule() {
    if (!f.title.trim() || !f.date || !f.time) { setErr(t('need_fields')); return }
    const starts = new Date(`${f.date}T${f.time}`)
    if (isNaN(starts.getTime())) { setErr(t('need_fields')); return }
    const ends = new Date(starts.getTime() + Math.max(5, Number(f.dur) || 30) * 60000)
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/meetings`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: f.title.trim(), starts_at: starts.toISOString(), ends_at: ends.toISOString(), reason: f.reason.trim() || null }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('save_failed')); return }
      setF({ title: '', date: '', time: '', dur: '30', reason: '' }); setAdding(false); await load()
    } finally { setBusy(false) }
  }

  async function setStatus(id: string, status: Meeting['status']) {
    setBusy(true)
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/meetings`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appt_id: id, status }),
      })
      if (res.ok) await load()
    } finally { setBusy(false) }
  }

  if (!loaded) return null
  const loc = lang === 'ru' ? 'ru-RU' : lang === 'he' ? 'he-IL' : 'en-US'
  const fmt = (iso: string) => { try { return new Date(iso).toLocaleString(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) } catch { return iso } }

  const inp: React.CSSProperties = { padding: '7px 9px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('title')}</h3>
        {canEdit && !adding && <button onClick={() => setAdding(true)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer' }}>+ {t('schedule')}</button>}
      </div>

      {adding && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12, padding: 10, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <input style={inp} placeholder={t('subject_ph')} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input style={{ ...inp, flex: 1 }} type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} />
            <input style={{ ...inp, width: 110 }} type="time" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} />
            <input style={{ ...inp, width: 74 }} type="number" min={5} step={5} value={f.dur} onChange={e => setF({ ...f, dur: e.target.value })} title={t('duration')} />
          </div>
          <input style={inp} placeholder={t('reason_ph')} value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} />
          {err && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={schedule} disabled={busy} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent-strong)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>{t('save')}</button>
            <button onClick={() => { setAdding(false); setErr('') }} style={{ fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>{t('cancel')}</button>
          </div>
        </div>
      )}

      {meetings.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {meetings.map(m => {
            const c = STATUS_COLOR[m.status]
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{m.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{fmt(m.starts_at)}{m.provider?.full_name ? ` · ${m.provider.full_name}` : ''}</div>
                  {m.reason && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{m.reason}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', background: c.bg, color: c.fg }}>{t(`status_${m.status}`)}</span>
                  {canEdit && m.status === 'scheduled' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setStatus(m.id, 'completed')} disabled={busy} title={t('mark_done')} style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', background: 'none', border: 'none', cursor: 'pointer' }}>✓ {t('done')}</button>
                      <button onClick={() => setStatus(m.id, 'cancelled')} disabled={busy} title={t('cancel_meeting')} style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
