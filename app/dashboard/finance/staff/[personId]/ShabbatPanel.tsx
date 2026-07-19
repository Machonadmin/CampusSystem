'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'

type ShabbatType = 'shabbat_host' | 'shabbat_family'

interface Attendee { journey_id: string; name: string }
interface ShabbatEvent {
  id: string
  entry_type: ShabbatType
  entry_date: string
  amount: number | string | null
  summary: string | null
  private_notes: string | null
  attendees: Attendee[]
}
interface StudentOption { journey_id: string; name: string }

/**
 * Панель «Шабат-приём» на карточке зарплаты сотрудника. Сотрудник принимает
 * учениц на Шабат — дома (shabbat_host) или приводит семью в учреждение
 * (shabbat_family). Одно событие = одна оплата. К событию отмечаются ученицы;
 * событие видно у каждой на её файле. Личное резюме (private_notes) видит только
 * менеджер, ученица — никогда. Деплой-безопасно: 503 → скрываем панель.
 */
export default function ShabbatPanel({ personId, canManage, year, month, onChanged }: {
  personId: string
  canManage: boolean
  year: number
  month: number
  onChanged: () => void
}) {
  const t = useTranslations('finance.staff')
  const primary = getModuleColor('finance', 'primary')

  const [events, setEvents] = useState<ShabbatEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [hidden, setHidden] = useState(false)   // 503 / нет фичи
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff-comp/${personId}/shabbat?year=${year}&month=${month}`)
      if (res.status === 503) { setHidden(true); return }
      if (!res.ok) return
      const b = await res.json()
      setEvents(b?.events ?? [])
    } catch { /* ignore */ }
    finally { setLoaded(true) }
  }, [personId, year, month])

  useEffect(() => { load() }, [load])

  async function createEvent(payload: Record<string, unknown>) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/staff-comp/${personId}/shabbat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { toast(t('entry_save_error'), 'error'); return }
      setAdding(false)
      await load()
      onChanged()
    } catch { toast(t('entry_save_error'), 'error') }
    finally { setBusy(false) }
  }

  async function deleteEvent(id: string) {
    if (!window.confirm(t('sh_confirm_delete'))) return
    try {
      const res = await fetch(`/api/staff-comp/${personId}/shabbat/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast(t('entry_save_error'), 'error'); return }
      await load()
      onChanged()
    } catch { toast(t('entry_save_error'), 'error') }
  }

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }
  const cardTitle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }

  const fmtDate = (d: string): string => {
    if (!d) return '—'
    try {
      const dt = new Date(`${d}T00:00:00Z`)
      if (isNaN(dt.getTime())) return d
      return dt.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
    } catch { return d }
  }
  const fmtAmount = (v: number | string | null): string => {
    if (v == null) return '—'
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n.toLocaleString() : '—'
  }
  const typeLabel = (ty: ShabbatType): string => t(`sh_type_${ty === 'shabbat_host' ? 'host' : 'family'}`)

  if (hidden || !loaded) return null

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={cardTitle}>{t('sh_title')}</div>
        {canManage && !adding && (
          <button onClick={() => setAdding(true)}
            style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', border: 'none', borderRadius: 8, background: primary, color: '#fff', cursor: 'pointer' }}>
            + {t('sh_add_event')}
          </button>
        )}
      </div>

      {adding && (
        <div style={{ marginBottom: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 10 }}>
          <ShabbatForm busy={busy} onCancel={() => setAdding(false)} onSubmit={createEvent} />
        </div>
      )}

      {events.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('sh_no_events')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {events.map(ev => (
            <div key={ev.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: getModuleColor('finance', 'light'), color: primary }}>
                    {typeLabel(ev.entry_type)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{fmtDate(ev.entry_date)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(ev.amount)}</span>
                </div>
                {canManage && (
                  <button onClick={() => deleteEvent(ev.id)} title={t('sh_delete')}
                    style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger,#DC2626)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                    × {t('sh_delete')}
                  </button>
                )}
              </div>

              {ev.attendees.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {ev.attendees.map(a => (
                    <span key={a.journey_id} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                      {a.name || a.journey_id}
                    </span>
                  ))}
                </div>
              )}

              {ev.summary && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8, whiteSpace: 'pre-wrap' }}>{ev.summary}</div>
              )}

              {ev.private_notes && (
                <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: 'var(--danger-tint, #FEF2F2)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger, #B91C1C)', marginBottom: 2 }}>{t('sh_private_notes')} · {t('sh_private_hint')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{ev.private_notes}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Add-event form ──────────────────────────────────────────────────────────

function ShabbatForm({ onSubmit, onCancel, busy }: {
  onSubmit: (payload: Record<string, unknown>) => void
  onCancel: () => void
  busy: boolean
}) {
  const t = useTranslations('finance.staff')
  const tCommon = useTranslations('common')
  const primary = getModuleColor('finance', 'primary')

  const [entryType, setEntryType] = useState<ShabbatType>('shabbat_host')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [summary, setSummary] = useState('')
  const [privateNotes, setPrivateNotes] = useState('')
  const [attendees, setAttendees] = useState<StudentOption[]>([])

  const [students, setStudents] = useState<StudentOption[]>([])
  const [search, setSearch] = useState('')

  // Ленивая подгрузка списка учениц для пикера участниц.
  useEffect(() => {
    if (students.length > 0) return
    fetch('/api/finance/students')
      .then(r => r.ok ? r.json() : null)
      .then(b => {
        const list = (b?.students ?? []) as Array<{ journey_id: string; full_name?: string; hebrew_name?: string | null }>
        setStudents(list.map(s => ({ journey_id: s.journey_id, name: (s.full_name || s.hebrew_name || '').trim() })))
      })
      .catch(() => {/* ignore */})
  }, [students.length])

  const selectedIds = useMemo(() => new Set(attendees.map(a => a.journey_id)), [attendees])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students
      .filter(s => !selectedIds.has(s.journey_id))
      .filter(s => !q || s.name.toLowerCase().includes(q))
      .slice(0, 30)
  }, [students, search, selectedIds])

  function addAttendee(s: StudentOption) { setAttendees(prev => [...prev, s]); setSearch('') }
  function removeAttendee(id: string) { setAttendees(prev => prev.filter(a => a.journey_id !== id)) }

  function submit() {
    onSubmit({
      entry_type: entryType,
      entry_date: entryDate,
      amount: amount.trim() === '' ? null : Number(amount),
      summary: summary.trim() || null,
      private_notes: privateNotes.trim() || null,
      attendee_journey_ids: attendees.map(a => a.journey_id),
    })
  }

  const inp: React.CSSProperties = {
    width: '100%', fontSize: 13, padding: '7px 10px',
    border: '1px solid var(--border-strong)', borderRadius: 8,
    color: 'var(--text)', background: 'var(--surface)', boxSizing: 'border-box', outline: 'none',
  }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>{t('sh_type')}</label>
          <select value={entryType} onChange={e => setEntryType(e.target.value as ShabbatType)} style={inp}>
            <option value="shabbat_host">{t('sh_type_host')}</option>
            <option value="shabbat_family">{t('sh_type_family')}</option>
          </select>
        </div>
        <div>
          <label style={lbl}>{t('sh_date')}</label>
          <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>{t('sh_amount')}</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} style={inp} />
        </div>
      </div>

      <div>
        <label style={lbl}>{t('sh_attendees')}</label>
        {attendees.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {attendees.map(a => (
              <button key={a.journey_id} onClick={() => removeAttendee(a.journey_id)} type="button"
                style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, background: getModuleColor('finance', 'light'), color: primary, border: `1px solid ${getModuleColor('finance', 'medium')}`, cursor: 'pointer' }}>
                {a.name || a.journey_id} ×
              </button>
            ))}
          </div>
        )}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('sh_search_student')} style={inp} />
        {search.trim() !== '' && (
          <div style={{ marginTop: 8, maxHeight: 200, overflowY: 'auto', display: 'grid', gap: 4 }}>
            {filtered.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '6px 4px' }}>—</div>
            ) : filtered.map(s => (
              <button key={s.journey_id} type="button" onClick={() => addAttendee(s)}
                style={{ textAlign: 'start', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                {s.name || s.journey_id}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label style={lbl}>{t('sh_summary')}</label>
        <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
      </div>

      <div>
        <label style={lbl}>
          {t('sh_private_notes')}
          <span style={{ fontWeight: 400, color: 'var(--danger,#DC2626)', marginInlineStart: 6 }}>· {t('sh_private_hint')}</span>
        </label>
        <textarea value={privateNotes} onChange={e => setPrivateNotes(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} disabled={busy}
          style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
          {tCommon('cancel')}
        </button>
        <button onClick={submit} disabled={busy}
          style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none', borderRadius: 8, background: primary, color: '#fff', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {t('sh_save')}
        </button>
      </div>
    </div>
  )
}
