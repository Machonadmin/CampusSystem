'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import ChavrutaPlusPanel from './ChavrutaPlusPanel'
import ShabbatPanel from './ShabbatPanel'

// ── Types ─────────────────────────────────────────────────────────────────────

type EntryType = 'teaching' | 'meeting' | 'chavruta' | 'chavruta_plus' | 'shabbat_host' | 'shabbat_family' | 'other'
const ENTRY_TYPES: EntryType[] = ['teaching', 'meeting', 'chavruta', 'chavruta_plus', 'shabbat_host', 'shabbat_family', 'other']

interface Rate {
  hourly_rate: number | string | null
  chavruta_rate: number | string | null
  chavruta_plus_rate: number | string | null
  chavruta_plus_basis: string | null
}

interface Entry {
  id: string
  entry_type: EntryType
  entry_date: string
  hours: number | string | null
  amount: number | string | null
  student_journey_id: string | null
  title: string | null
  summary: string | null
  private_notes: string | null
  created_at: string | null
}

interface PayslipGroup { type: EntryType; count: number; hours: number; amount: number }
interface Payslip { status: string; total_amount: number | string | null; approved_at: string | null }

interface Props {
  personId: string
  fullName: string
  hebrewName: string | null
  canManage: boolean
  canApprove: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function num(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function fmtMoney(v: number | string | null | undefined): string {
  return num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtHours(v: number | string | null | undefined): string {
  const n = num(v)
  return n === 0 ? '—' : String(n)
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  width: '100%', fontSize: 13, padding: '7px 10px',
  border: '1px solid var(--border-strong)', borderRadius: 8,
  color: 'var(--text)', background: 'var(--surface)', boxSizing: 'border-box', outline: 'none',
}
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }
const cardTitle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }

// ── Entry form (add + edit) ─────────────────────────────────────────────────

function EntryForm({ initial, editing, onSubmit, onCancel, busy }: {
  initial?: Partial<Entry>
  editing: boolean
  onSubmit: (payload: Record<string, unknown>) => void
  onCancel: () => void
  busy: boolean
}) {
  const t = useTranslations('finance.staff')
  const tCommon = useTranslations('common')
  const primary = getModuleColor('finance', 'primary')

  const [entryType, setEntryType] = useState<EntryType>((initial?.entry_type as EntryType) ?? 'other')
  const [entryDate, setEntryDate] = useState(initial?.entry_date ?? new Date().toISOString().slice(0, 10))
  const [hours, setHours] = useState(initial?.hours != null ? String(initial.hours) : '')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [privateNotes, setPrivateNotes] = useState(initial?.private_notes ?? '')

  function submit() {
    const payload: Record<string, unknown> = {
      entry_date: entryDate,
      hours: hours.trim() === '' ? null : Number(hours),
      amount: amount.trim() === '' ? null : Number(amount),
      title: title.trim() || null,
      summary: summary.trim() || null,
      private_notes: privateNotes.trim() || null,
    }
    if (!editing) payload.entry_type = entryType
    onSubmit(payload)
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>{t('entry_type')}</label>
          {editing ? (
            <div style={{ ...inp, background: 'var(--surface-2)' }}>{t(`types.${entryType}`, entryType)}</div>
          ) : (
            <select value={entryType} onChange={e => setEntryType(e.target.value as EntryType)} style={inp}>
              {ENTRY_TYPES.map(ty => <option key={ty} value={ty}>{t(`types.${ty}`, ty)}</option>)}
            </select>
          )}
        </div>
        <div>
          <label style={lbl}>{t('entry_date')}</label>
          <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} style={inp} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={lbl}>{t('hours')}</label>
          <input type="number" step="0.01" min="0" value={hours} onChange={e => setHours(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>{t('amount')}</label>
          <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} style={inp} />
        </div>
      </div>
      <div>
        <label style={lbl}>{t('entry_title')}</label>
        <input value={title} onChange={e => setTitle(e.target.value)} style={inp} />
      </div>
      <div>
        <label style={lbl}>{t('summary')}</label>
        <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
      </div>
      <div>
        <label style={lbl}>
          {t('private_notes')}
          <span style={{ fontWeight: 400, color: 'var(--text-faint)', marginInlineStart: 6 }}>· {t('private_notes_hint')}</span>
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
          {tCommon('save')}
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PayslipClient({ personId, fullName, hebrewName, canManage, canApprove }: Props) {
  const t = useTranslations('finance.staff')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const primary = getModuleColor('finance', 'primary')

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [rate, setRate] = useState<Rate | null>(null)
  const [rateDraft, setRateDraft] = useState<Rate | null>(null)
  const [savingRate, setSavingRate] = useState(false)

  const [groups, setGroups] = useState<PayslipGroup[]>([])
  const [total, setTotal] = useState(0)
  const [payslip, setPayslip] = useState<Payslip | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const displayName = fullName || hebrewName || personId

  // 503 → миграция не применена. Возвращаем текст ошибки, иначе null.
  async function readError(res: Response): Promise<string> {
    const body = await res.json().catch(() => ({}))
    if (res.status === 503) return body.error ?? t('migration_needed')
    return body.error ?? t('load_error')
  }

  const loadRate = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff-comp/${personId}/rate`)
      if (!res.ok) return
      const body = await res.json()
      const r: Rate = body.rate ?? { hourly_rate: null, chavruta_rate: null, chavruta_plus_rate: null, chavruta_plus_basis: 'per_hour' }
      setRate(r)
      setRateDraft(r)
    } catch { /* тарифы необязательны для отображения листа */ }
  }, [personId])

  const loadMonth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pRes, eRes] = await Promise.all([
        fetch(`/api/staff-comp/${personId}/payslip?year=${year}&month=${month}`),
        fetch(`/api/staff-comp/${personId}/entries?year=${year}&month=${month}`),
      ])
      if (!pRes.ok) { setError(await readError(pRes)); return }
      if (!eRes.ok) { setError(await readError(eRes)); return }
      const pBody = await pRes.json()
      const eBody = await eRes.json()
      setGroups(pBody.groups ?? [])
      setTotal(num(pBody.total))
      setPayslip(pBody.payslip ?? null)
      setEntries(eBody.entries ?? [])
    } catch {
      setError(t('load_error'))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, year, month, t])

  useEffect(() => { loadRate() }, [loadRate])
  useEffect(() => { loadMonth() }, [loadMonth])

  async function saveRate() {
    if (!rateDraft || savingRate) return
    setSavingRate(true)
    try {
      const res = await fetch(`/api/staff-comp/${personId}/rate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hourly_rate: rateDraft.hourly_rate === '' ? null : num(rateDraft.hourly_rate),
          chavruta_rate: rateDraft.chavruta_rate === '' ? null : num(rateDraft.chavruta_rate),
          chavruta_plus_rate: rateDraft.chavruta_plus_rate === '' ? null : num(rateDraft.chavruta_plus_rate),
          chavruta_plus_basis: rateDraft.chavruta_plus_basis ?? 'per_hour',
        }),
      })
      if (!res.ok) { toast(await readError(res), 'error'); return }
      toast(t('rates_saved'), 'success')
      await loadRate()
    } catch {
      toast(t('rates_save_error'), 'error')
    } finally {
      setSavingRate(false)
    }
  }

  async function generateTeaching() {
    if (generating) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/staff-comp/${personId}/generate-teaching?year=${year}&month=${month}`, { method: 'POST' })
      if (!res.ok) { toast(await readError(res), 'error'); return }
      const body = await res.json()
      toast(t('generate_result').replace('{created}', String(body.created ?? 0)).replace('{skipped}', String(body.skipped ?? 0)), 'success')
      await loadMonth()
    } catch {
      toast(t('generate_error'), 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function approve() {
    if (approving) return
    if (!window.confirm(t('approve_confirm'))) return
    setApproving(true)
    try {
      const res = await fetch(`/api/staff-comp/${personId}/payslip?year=${year}&month=${month}`, { method: 'POST' })
      if (!res.ok) { toast(await readError(res), 'error'); return }
      await loadMonth()
    } catch {
      toast(t('approve_error'), 'error')
    } finally {
      setApproving(false)
    }
  }

  async function createEntry(payload: Record<string, unknown>) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/staff-comp/${personId}/entries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) { toast(await readError(res), 'error'); return }
      toast(t('entry_saved'), 'success')
      setAdding(false)
      await loadMonth()
    } catch {
      toast(t('entry_save_error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function updateEntry(id: string, payload: Record<string, unknown>) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/staff-comp/entries/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) { toast(await readError(res), 'error'); return }
      toast(t('entry_saved'), 'success')
      setEditingId(null)
      await loadMonth()
    } catch {
      toast(t('entry_save_error'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function deleteEntry(id: string) {
    if (!window.confirm(t('delete_confirm'))) return
    try {
      const res = await fetch(`/api/staff-comp/entries/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast(await readError(res), 'error'); return }
      toast(t('entry_deleted'), 'success')
      await loadMonth()
    } catch {
      toast(t('entry_save_error'), 'error')
    }
  }

  const approved = payslip?.status === 'approved'

  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const thNum: React.CSSProperties = { ...th, textAlign: 'end' }
  const td: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '8px 12px', borderBottom: '1px solid var(--surface-2)' }
  const tdNum: React.CSSProperties = { ...td, textAlign: 'end', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('finance'), href: '/dashboard/finance' },
        { label: t('title'), href: '/dashboard/finance/staff' },
        { label: displayName },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('finance'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(5,150,105,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{displayName}</h1>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('subtitle')}</div>
        </div>
        {/* Month selector */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            style={{ fontSize: 13, padding: '7px 10px', borderRadius: 8, border: 'none', color: 'var(--text)', background: 'var(--surface)' }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{t(`months.${m}`, String(m))}</option>
            ))}
          </select>
          <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ width: 90, fontSize: 13, padding: '7px 10px', borderRadius: 8, border: 'none', color: 'var(--text)', background: 'var(--surface)' }} />
        </div>
      </div>

      {/* Rates */}
      {rateDraft && (
        <div style={card}>
          <div style={cardTitle}>{t('rates_title')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={lbl}>{t('hourly_rate')}</label>
              <input type="number" step="0.01" min="0" disabled={!canManage}
                value={rateDraft.hourly_rate ?? ''}
                onChange={e => setRateDraft({ ...rateDraft, hourly_rate: e.target.value })} style={inp} />
            </div>
            <div>
              <label style={lbl}>{t('chavruta_rate')}</label>
              <input type="number" step="0.01" min="0" disabled={!canManage}
                value={rateDraft.chavruta_rate ?? ''}
                onChange={e => setRateDraft({ ...rateDraft, chavruta_rate: e.target.value })} style={inp} />
            </div>
            <div>
              <label style={lbl}>{t('chavruta_plus_rate')}</label>
              <input type="number" step="0.01" min="0" disabled={!canManage}
                value={rateDraft.chavruta_plus_rate ?? ''}
                onChange={e => setRateDraft({ ...rateDraft, chavruta_plus_rate: e.target.value })} style={inp} />
            </div>
            <div>
              <label style={lbl}>{t('basis')}</label>
              <select disabled={!canManage} value={rateDraft.chavruta_plus_basis ?? 'per_hour'}
                onChange={e => setRateDraft({ ...rateDraft, chavruta_plus_basis: e.target.value })} style={inp}>
                <option value="per_student_month">{t('basis_per_student_month')}</option>
                <option value="per_hour">{t('basis_per_hour')}</option>
              </select>
            </div>
          </div>
          {canManage && (
            <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
              <button onClick={saveRate} disabled={savingRate}
                style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none', borderRadius: 8, background: primary, color: '#fff', cursor: savingRate ? 'default' : 'pointer', opacity: savingRate ? 0.6 : 1 }}>
                {t('save_rates')}
              </button>
              <button onClick={generateTeaching} disabled={generating}
                style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', border: `1px solid ${getModuleColor('finance', 'medium')}`, borderRadius: 8, background: getModuleColor('finance', 'light'), color: primary, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.6 : 1 }}>
                {t('generate_teaching')}
              </button>
            </div>
          )}
        </div>
      )}

      {error ? (
        <div style={{ ...card, color: '#DC2626', fontSize: 13 }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : (
        <>
          {/* Chavruta Plus (mentorship) assignments */}
          <ChavrutaPlusPanel personId={personId} canManage={canManage} year={year} month={month} onGenerated={loadMonth} />
          <ShabbatPanel personId={personId} canManage={canManage} year={year} month={month} onChanged={loadMonth} />

          {/* Payslip summary */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <div style={cardTitle}>{t('summary_title')}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {approved ? (
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: '#D1FAE5', color: '#065F46' }}>
                    {t('approved')} · {fmtDate(payslip?.approved_at ?? null)}
                  </span>
                ) : canApprove && (
                  <button onClick={approve} disabled={approving}
                    style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none', borderRadius: 8, background: primary, color: '#fff', cursor: approving ? 'default' : 'pointer', opacity: approving ? 0.6 : 1 }}>
                    {t('approve')}
                  </button>
                )}
              </div>
            </div>

            {groups.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('no_entries')}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>{t('col_type')}</th>
                      <th style={thNum}>{t('col_count')}</th>
                      <th style={thNum}>{t('col_hours')}</th>
                      <th style={thNum}>{t('col_amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => (
                      <tr key={g.type}>
                        <td style={td}>{t(`types.${g.type}`, g.type)}</td>
                        <td style={tdNum}>{g.count}</td>
                        <td style={tdNum}>{fmtHours(g.hours)}</td>
                        <td style={tdNum}>{fmtMoney(g.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{t('total')}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: primary, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(total)}</span>
            </div>
          </div>

          {/* Entries */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
              <div style={cardTitle}>{t('entries_title')}</div>
              {canManage && !adding && (
                <button onClick={() => { setAdding(true); setEditingId(null) }}
                  style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', border: 'none', borderRadius: 8, background: primary, color: '#fff', cursor: 'pointer' }}>
                  + {t('add_entry')}
                </button>
              )}
            </div>

            {adding && (
              <div style={{ marginBottom: 16, padding: 16, background: 'var(--surface-2)', borderRadius: 10 }}>
                <EntryForm editing={false} busy={busy} onCancel={() => setAdding(false)} onSubmit={createEntry} />
              </div>
            )}

            {entries.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('no_entries')}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>{t('entry_type')}</th>
                      <th style={th}>{t('entry_date')}</th>
                      <th style={thNum}>{t('hours')}</th>
                      <th style={thNum}>{t('amount')}</th>
                      <th style={th}>{t('entry_title')}</th>
                      {canManage && <th style={{ ...th, textAlign: 'end' }} />}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(en => (
                      editingId === en.id ? (
                        <tr key={en.id}>
                          <td style={td} colSpan={canManage ? 6 : 5}>
                            <div style={{ padding: 12, background: 'var(--surface-2)', borderRadius: 10 }}>
                              <EntryForm editing busy={busy} initial={en}
                                onCancel={() => setEditingId(null)}
                                onSubmit={p => updateEntry(en.id, p)} />
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={en.id}>
                          <td style={td}>{t(`types.${en.entry_type}`, en.entry_type)}</td>
                          <td style={td}>{fmtDate(en.entry_date)}</td>
                          <td style={tdNum}>{fmtHours(en.hours)}</td>
                          <td style={tdNum}>{fmtMoney(en.amount)}</td>
                          <td style={td}>
                            {en.title || '—'}
                            {en.private_notes && (
                              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                                {t('private_notes')}: {en.private_notes}
                              </div>
                            )}
                          </td>
                          {canManage && (
                            <td style={{ ...td, textAlign: 'end', whiteSpace: 'nowrap' }}>
                              <button onClick={() => { setEditingId(en.id); setAdding(false) }}
                                style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', marginInlineEnd: 6 }}>
                                {tCommon('edit')}
                              </button>
                              <button onClick={() => deleteEntry(en.id)}
                                style={{ fontSize: 12, padding: '4px 10px', border: '1px solid #FEE2E2', borderRadius: 6, background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}>
                                {tCommon('delete')}
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
