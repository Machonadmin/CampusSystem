'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { MiniBar } from '@/components/ui/MiniBar'
import { formatMoney } from '@/lib/finance/money'
import { downloadCsv } from '@/lib/csv'
import { PhoneLink } from '@/components/ui/PhoneLink'

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
  discounts_total?: number
  payments_total: number
  balance: number
  overdue_days: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '—'
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
  // Гашение месячного сбора: только должницы + сортировка (имя/долг/просрочка).
  const [debtorsOnly, setDebtorsOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'name' | 'balance' | 'overdue'>('name')
  const [canCharge, setCanCharge] = useState(false)
  const [canManageAccess, setCanManageAccess] = useState(false)

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
      setCanManageAccess(!!body.can_manage_access)
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
  const searched = q
    ? items.filter(s =>
        s.full_name.toLowerCase().includes(q) ||
        (s.hebrew_name ?? '').toLowerCase().includes(q) ||
        (s.email ?? '').toLowerCase().includes(q) ||
        s.phones.join(' ').includes(q))
    : items
  const filtered = (debtorsOnly ? searched.filter(s => s.balance > 0.005) : searched)
    .slice()
    .sort((a, b) => {
      if (sortBy === 'balance') return b.balance - a.balance
      if (sortBy === 'overdue') return (b.overdue_days ?? -1) - (a.overdue_days ?? -1)
      return a.full_name.localeCompare(b.full_name)
    })

  const primary = getModuleColor('finance', 'primary')

  // Сводка сбора по всем студенткам (не по фильтру): сколько начислено, оплачено,
  // сколько осталось. Даёт мгновенную картину «где мы» + мини-график доли сбора.
  const totals = items.reduce((a, s) => {
    a.charged += s.charges_total
    a.discounts += s.discounts_total ?? 0
    a.paid += s.payments_total
    return a
  }, { charged: 0, discounts: 0, paid: 0 })
  const hasDiscounts = totals.discounts > 0.005
  const outstanding = Math.max(0, totals.charged - totals.discounts - totals.paid)
  const collectedPct = totals.charged > 0 ? Math.round(totals.paid / totals.charged * 100) : 0

  // Экспорт текущего (отфильтрованного) списка в CSV — для месячного сбора.
  function exportDebtors() {
    const headers = [t('list.col_name'), t('list.col_charges'), t('list.col_discounts'), t('list.col_payments'), t('list.col_balance'), t('list.col_overdue')]
    const rows = filtered.map(s => [
      s.full_name, String(s.charges_total), String(s.discounts_total ?? 0), String(s.payments_total), String(s.balance),
      s.overdue_days != null ? String(s.overdue_days) : '',
    ])
    downloadCsv('debtors', [headers, ...rows])
  }

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
      <ModuleHeader
        module="finance"
        title={tNav('finance')}
        subtitle={t('list.subtitle')}
        actions={<>
          {/* Ссылка на управление доступом — только тем, кто может им управлять
              (иначе кнопка вела в «אין גישה»). */}
          {canManageAccess && (
            <a href="/dashboard/finance/access" className="no-underline" style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: 'var(--surface)', color: primary }}>
              {t('access.link_label')}
            </a>
          )}
          <a href="/dashboard/finance/semesters" className="no-underline" style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: 'var(--surface)', color: primary }}>
            {t('semesters.title')}
          </a>
          <a href="/dashboard/finance/staff" className="no-underline" style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: 'var(--surface)', color: primary }}>
            {t('staff.link_label')}
          </a>
        </>}
      />

      {/* Сводка сбора: начислено / оплачено / остаток + доля собранного. */}
      {!loading && !error && totals.charged > 0 && (
        <div className="anim-rise" style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
          padding: '14px 18px', boxShadow: 'var(--shadow)', display: 'grid', gap: 12,
        }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <Metric label={t('list.sum_charged')} value={formatMoney(totals.charged)} color="var(--text)" />
            {hasDiscounts && <Metric label={t('list.sum_discounts')} value={`−${formatMoney(totals.discounts)}`} color="var(--violet)" />}
            <Metric label={t('list.sum_collected')} value={formatMoney(totals.paid)} color="var(--success)" />
            <Metric label={t('list.sum_outstanding')} value={formatMoney(outstanding)} color={outstanding > 0.005 ? 'var(--danger)' : 'var(--success)'} />
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>
              {t('list.sum_collected_pct').replace('{n}', String(collectedPct))}
            </div>
          </div>
          <MiniBar height={10} segments={[
            { value: totals.paid, color: 'var(--success)', label: t('list.sum_collected') },
            ...(hasDiscounts ? [{ value: totals.discounts, color: 'var(--violet)', label: t('list.sum_discounts') }] : []),
            { value: outstanding, color: 'var(--danger)', label: t('list.sum_outstanding') },
          ]} />
        </div>
      )}

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
        <button
          onClick={() => setDebtorsOnly(v => !v)}
          style={{
            fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
            border: `1px solid ${debtorsOnly ? 'var(--danger)' : 'var(--border-strong)'}`,
            background: debtorsOnly ? 'var(--danger-tint)' : 'var(--surface)',
            color: debtorsOnly ? 'var(--danger)' : 'var(--text-muted)', whiteSpace: 'nowrap',
          }}
        >
          {t('list.debtors_only')}
        </button>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'name' | 'balance' | 'overdue')}
          style={{ fontSize: 12.5, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)' }}
        >
          <option value="name">{t('list.sort_name')}</option>
          <option value="balance">{t('list.sort_balance')}</option>
          <option value="overdue">{t('list.sort_overdue')}</option>
        </select>
        <button
          onClick={exportDebtors}
          disabled={filtered.length === 0}
          style={{
            fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 8,
            cursor: filtered.length === 0 ? 'default' : 'pointer', whiteSpace: 'nowrap',
            border: '1px solid var(--border-strong)', background: 'var(--surface)',
            color: 'var(--text-muted)', opacity: filtered.length === 0 ? 0.5 : 1,
          }}
        >
          {t('list.export_csv')}
        </button>
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
        <SkeletonRows avatar={false} rows={6} />
      ) : filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14, background: 'var(--surface)', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>{t('list.empty')}</div>
      ) : (
        <div className="anim-rise" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
          <table className="cards-sm" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {selectMode && <th style={{ ...th, width: 36, textAlign: 'center' }} />}
                <th style={th}>{t('list.col_name')}</th>
                <th style={thNum}>{t('list.col_charges')}</th>
                {hasDiscounts && <th style={thNum}>{t('list.col_discounts')}</th>}
                <th style={thNum}>{t('list.col_payments')}</th>
                <th style={thNum}>{t('list.col_balance')}</th>
                <th style={th}>{t('list.col_overdue')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, rowIdx) => {
                // balance > 0 → студент должен (красный); ≤ 0 → оплачено/переплата (зелёный)
                const owes = s.balance > 0.005
                return (
                  <tr
                    key={s.journey_id}
                    className="anim-row"
                    onClick={() => selectMode ? toggleSelect(s.journey_id) : router.push(`/dashboard/finance/${s.journey_id}`)}
                    style={{ ['--i' as string]: rowIdx, cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--success-tint)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
                  >
                    {selectMode && (
                      <td data-label="" style={{ ...td, textAlign: 'center' }} onClick={e => { e.stopPropagation(); toggleSelect(s.journey_id) }}>
                        <input type="checkbox" checked={selected.has(s.journey_id)} readOnly style={{ cursor: 'pointer' }} />
                      </td>
                    )}
                    <td data-label={t('list.col_name')} style={td}>
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
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 500 }}>{s.full_name || '—'}</span>
                          {/* Телефон должницы прямо в списке — самый частый шаг
                              месячного сбора: позвонить/написать в один тап. */}
                          {s.phones[0] && (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                              <PhoneLink phone={s.phones[0]} />
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td data-label={t('list.col_charges')} style={tdNum}>{formatMoney(s.charges_total)}</td>
                    {hasDiscounts && <td data-label={t('list.col_discounts')} style={{ ...tdNum, color: 'var(--violet)' }}>{(s.discounts_total ?? 0) > 0.005 ? `−${formatMoney(s.discounts_total ?? 0)}` : '—'}</td>}
                    <td data-label={t('list.col_payments')} style={tdNum}>{formatMoney(s.payments_total)}</td>
                    <td data-label={t('list.col_balance')} style={{ ...tdNum, fontWeight: 700, color: owes ? 'var(--danger)' : 'var(--success)' }}>
                      {formatMoney(s.balance)}
                    </td>
                    <td data-label={t('list.col_overdue')} style={td}>
                      {s.overdue_days != null && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
                          background: s.overdue_days > 60 ? 'var(--danger-tint)' : s.overdue_days > 30 ? 'var(--warn-tint)' : 'var(--surface-2)',
                          color: s.overdue_days > 60 ? 'var(--danger)' : s.overdue_days > 30 ? 'var(--warn)' : 'var(--text-muted)',
                        }}>
                          {t('list.overdue_days').replace('{n}', String(s.overdue_days))}
                        </span>
                      )}
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
        <Modal
          onClose={() => { if (!bulkBusy) setChargeOpen(false) }}
          maxWidth={460}
          zIndex={50}
          closeOnBackdrop
          panelStyle={{ borderRadius: 14, padding: 22, boxShadow: 'var(--shadow-lg)' }}
        >
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
        </Modal>
      )}
    </div>
  )
}

const inpModal: React.CSSProperties = {
  width: '100%', fontSize: 13, padding: '8px 10px',
  border: '1px solid var(--border-strong)', borderRadius: 8,
  color: 'var(--text)', background: 'var(--surface)',
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}
