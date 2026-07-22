'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinanceStudent {
  journey_id: string
  person_id: string
  full_name: string
  hebrew_name: string | null
  email: string | null
  phones: string[]
  photo_url: string | null
  charges_total: number
  payments_total: number
  balance: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '—'
}

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const router = useRouter()
  const t = useTranslations('finance')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [items, setItems] = useState<FinanceStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [canCharge, setCanCharge] = useState(false)

  // ── Массовое начисление (bulk charge) ──
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [chargeOpen, setChargeOpen] = useState(false)
  const [cAmount, setCAmount] = useState('')
  const [cDescription, setCDescription] = useState('')
  const [cPeriod, setCPeriod] = useState('')
  const [cDueDate, setCDueDate] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/students')
      if (res.status === 403) {
        setError(t('list.forbidden'))
        setItems([])
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? t('list.load_error'))
        setItems([])
        return
      }
      const body = await res.json()
      setItems(body.students ?? [])
      setCanCharge(!!body.can_charge)
    } catch {
      setError(t('list.load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function exitSelect() { setSelectMode(false); setSelected(new Set()) }

  async function applyBulkCharge() {
    const amount = Number(cAmount)
    if (!Number.isFinite(amount) || amount <= 0 || !cDescription.trim() || selected.size === 0) return
    setBulkBusy(true); setBulkMsg(null)
    let ok = 0, fail = 0
    for (const jid of selected) {
      const res = await fetch(`/api/finance/journeys/${jid}/charges`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          description: cDescription.trim(),
          period_label: cPeriod.trim() || null,
          due_date: cDueDate.trim() || null,
        }),
      })
      if (res.ok) ok++; else fail++
    }
    setBulkBusy(false)
    setChargeOpen(false)
    setCAmount(''); setCDescription(''); setCPeriod(''); setCDueDate('')
    setBulkMsg(t('bulk.result').replace('{ok}', String(ok)).replace('{fail}', String(fail)))
    exitSelect()
    load()
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? items.filter(s =>
        s.full_name.toLowerCase().includes(q) ||
        (s.hebrew_name ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q))
    : items

  const primary = getModuleColor('finance', 'primary')

  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const thNum: React.CSSProperties = { ...th, textAlign: 'right' }
  const td: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '10px 12px', borderBottom: '1px solid var(--surface-2)' }
  const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('finance') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('finance'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(5,150,105,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{tNav('finance')}</h1>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('list.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href="/dashboard/finance/access" className="no-underline" style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: 'var(--surface)', color: primary }}>
            {t('access.link_label')}
          </a>
          <a href="/dashboard/finance/semesters" className="no-underline" style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: 'var(--surface)', color: primary }}>
            {t('semesters.title')}
          </a>
          <a href="/dashboard/finance/staff" className="no-underline" style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: 'var(--surface)', color: primary }}>
            {t('staff.link_label')}
          </a>
        </div>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('list.search_placeholder')}
          style={{
            flex: 1, maxWidth: 360, fontSize: 13, padding: '8px 12px',
            border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {t('list.count')}: {filtered.length}
        </span>
        <div style={{ flex: 1 }} />
        {canCharge && (
          <button
            onClick={() => { if (selectMode) exitSelect(); else { setSelectMode(true); setBulkMsg(null) } }}
            style={{
              fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              background: selectMode ? 'var(--success-tint)' : 'var(--surface)',
              color: selectMode ? 'var(--success)' : 'var(--text)',
              border: `1px solid ${selectMode ? 'var(--success)' : 'var(--border-strong)'}`,
            }}
          >
            {selectMode ? t('bulk.exit') : t('bulk.select')}
          </button>
        )}
      </div>

      {/* Панель массового начисления */}
      {selectMode && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 16px', background: 'var(--surface)', border: '1px solid var(--success)', borderRadius: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{t('bulk.selected').replace('{n}', String(selected.size))}</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { if (selected.size > 0) setChargeOpen(true) }}
            disabled={selected.size === 0}
            style={{ fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: selected.size === 0 ? 'default' : 'pointer', background: primary, color: '#fff', border: 'none', opacity: selected.size === 0 ? 0.5 : 1 }}
          >
            {t('bulk.charge')}
          </button>
        </div>
      )}

      {bulkMsg && (
        <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, color: 'var(--text)' }}>{bulkMsg}</div>
      )}

      {/* Body */}
      {error ? (
        <div style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14, background: 'var(--surface)', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>{t('list.empty')}</div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {selectMode && <th style={{ ...th, width: 36, textAlign: 'center' }} />}
                <th style={th}>{t('list.col_name')}</th>
                <th style={thNum}>{t('list.col_charges')}</th>
                <th style={thNum}>{t('list.col_payments')}</th>
                <th style={thNum}>{t('list.col_balance')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                // balance > 0 → студент должен (красный); ≤ 0 → оплачено/переплата (зелёный)
                const owes = s.balance > 0.005
                return (
                  <tr
                    key={s.journey_id}
                    onClick={() => selectMode ? toggleSelect(s.journey_id) : router.push(`/dashboard/finance/${s.journey_id}`)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--success-tint)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                  >
                    {selectMode && (
                      <td style={{ ...td, textAlign: 'center' }} onClick={e => { e.stopPropagation(); toggleSelect(s.journey_id) }}>
                        <input type="checkbox" checked={selected.has(s.journey_id)} readOnly style={{ cursor: 'pointer' }} />
                      </td>
                    )}
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                          background: 'var(--success-tint)', color: primary,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                        }}>
                          {s.photo_url
                            ? <img src={s.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : initials(s.full_name)}
                        </div>
                        <span style={{ fontWeight: 500 }}>{s.full_name || '—'}</span>
                      </div>
                    </td>
                    <td style={tdNum}>{fmtMoney(s.charges_total)}</td>
                    <td style={tdNum}>{fmtMoney(s.payments_total)}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: owes ? 'var(--danger)' : 'var(--success)' }}>
                      {fmtMoney(s.balance)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Модалка массового начисления */}
      {chargeOpen && (
        <div
          onClick={() => { if (!bulkBusy) setChargeOpen(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 460, padding: 22, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{t('bulk.charge_title')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{t('bulk.selected').replace('{n}', String(selected.size))}</p>
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('bulk.f_amount')} *</span>
                <input type="number" min="0" step="0.01" value={cAmount} onChange={e => setCAmount(e.target.value)} style={inpModal} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('bulk.f_description')} *</span>
                <input value={cDescription} onChange={e => setCDescription(e.target.value)} style={inpModal} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('bulk.f_period')}</span>
                <input value={cPeriod} onChange={e => setCPeriod(e.target.value)} style={inpModal} />
              </label>
              <label style={{ display: 'block' }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{t('bulk.f_due_date')}</span>
                <input type="date" value={cDueDate} onChange={e => setCDueDate(e.target.value)} style={inpModal} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setChargeOpen(false)} disabled={bulkBusy} style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>{tCommon('cancel')}</button>
              <button onClick={applyBulkCharge} disabled={bulkBusy || !(Number(cAmount) > 0) || !cDescription.trim()} style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none', borderRadius: 8, background: primary, color: '#fff', cursor: bulkBusy || !(Number(cAmount) > 0) || !cDescription.trim() ? 'default' : 'pointer', opacity: bulkBusy || !(Number(cAmount) > 0) || !cDescription.trim() ? 0.6 : 1 }}>{t('bulk.charge')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inpModal: React.CSSProperties = {
  width: '100%', fontSize: 13, padding: '8px 10px',
  border: '1px solid var(--border-strong)', borderRadius: 8,
  color: 'var(--text)', background: 'var(--surface)',
}
