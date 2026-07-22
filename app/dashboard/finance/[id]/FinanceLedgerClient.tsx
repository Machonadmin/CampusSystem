'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { RowActionsMenu } from '@/components/ui/RowActionsMenu'

// ── Types (mirror the ledger API response) ──────────────────────────────────

interface Discount {
  id: string
  percent: number
  amount: number
  reason: string | null
  signer_name: string | null
  typed_name: string | null
  signed_at: string | null
  created_at: string | null
}
interface Charge {
  id: string
  amount: number
  description: string
  period_label: string | null
  due_date: string | null
  status: 'active' | 'cancelled'
  discounts: Discount[]
}
interface Payment {
  id: string
  amount: number
  paid_at: string
  method: string | null
  reference: string | null
  deposited_to: string | null
  from_account: string | null
  to_account: string | null
  signer_name: string | null
  typed_name: string | null
  signed_at: string | null
  status: 'pending' | 'approved' | 'cancelled'
  approved_at: string | null
}
interface Totals {
  charges_active: number
  payments_approved: number
  payments_pending: number
  discounts_total: number
  balance: number
}
interface Ledger {
  charges: Charge[]
  payments: Payment[]
  totals: Totals
}

interface Props {
  journeyId: string
  fullName: string
  hebrewName: string | null
  photoUrl: string | null
  canCreateInvoice: boolean
  canApprove: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '—'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FinanceLedgerClient({
  journeyId, fullName, hebrewName, photoUrl, canCreateInvoice, canApprove,
}: Props) {
  const t = useTranslations('finance')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [showCharge, setShowCharge] = useState(false)
  const [showPayment, setShowPayment] = useState(false)

  // charge form
  const [cAmount, setCAmount] = useState('')
  const [cDesc, setCDesc] = useState('')
  const [cPeriod, setCPeriod] = useState('')
  const [cDue, setCDue] = useState('')
  // payment form
  const [pAmount, setPAmount] = useState('')
  const [pDate, setPDate] = useState('')
  const [pMethod, setPMethod] = useState('cash')
  const [pRef, setPRef] = useState('')
  const [pDepositedTo, setPDepositedTo] = useState('')
  const [pFromAccount, setPFromAccount] = useState('')
  const [pToAccount, setPToAccount] = useState('')
  const [pSignature, setPSignature] = useState('')
  // discount form (per charge)
  const [discountChargeId, setDiscountChargeId] = useState<string | null>(null)
  const [dPercent, setDPercent] = useState('')
  const [dReason, setDReason] = useState('')
  const [dSignature, setDSignature] = useState('')

  const primary = getModuleColor('finance', 'primary')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/finance/journeys/${journeyId}/ledger`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? t('ledger.load_error'))
        setLedger(null)
        return
      }
      const body = await res.json()
      setLedger({ charges: body.charges ?? [], payments: body.payments ?? [], totals: body.totals })
    } catch {
      setError(t('ledger.load_error'))
    } finally {
      setLoading(false)
    }
  }, [journeyId, t])

  useEffect(() => { load() }, [load])

  // Универсальный вызов мутации + перезагрузка ПНК.
  const mutate = useCallback(async (
    url: string, method: string, body?: unknown, after?: () => void,
  ) => {
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setActionError(b.error ?? t('ledger.action_failed'))
        return
      }
      after?.()
      await load()
    } catch {
      setActionError(t('ledger.action_failed'))
    } finally {
      setBusy(false)
    }
  }, [load, t])

  function submitCharge() {
    if (!cAmount.trim() || !cDesc.trim()) { setActionError(t('form.required')); return }
    mutate(
      `/api/finance/journeys/${journeyId}/charges`, 'POST',
      { amount: Number(cAmount), description: cDesc.trim(), period_label: cPeriod.trim() || null, due_date: cDue || null },
      () => { setCAmount(''); setCDesc(''); setCPeriod(''); setCDue(''); setShowCharge(false) },
    )
  }
  const pAmountNum = Number(pAmount)
  const paymentValid = pAmount.trim() !== '' && Number.isFinite(pAmountNum) && pAmountNum > 0 && !!pDate && pSignature.trim() !== ''
  const isTransfer = pMethod === 'transfer'
  function submitPayment() {
    if (!paymentValid) { setActionError(t('form.required')); return }
    mutate(
      `/api/finance/journeys/${journeyId}/payments`, 'POST',
      {
        amount: pAmountNum,
        paid_at: pDate,
        method: pMethod || null,
        reference: pRef.trim() || null,
        typed_name: pSignature.trim(),
        ...(isTransfer
          ? { from_account: pFromAccount.trim() || null, to_account: pToAccount.trim() || null }
          : { deposited_to: pDepositedTo.trim() || null }),
      },
      () => {
        setPAmount(''); setPDate(''); setPMethod('cash'); setPRef('')
        setPDepositedTo(''); setPFromAccount(''); setPToAccount(''); setPSignature('')
        setShowPayment(false)
      },
    )
  }

  function openDiscount(chargeId: string) {
    setActionError(null)
    setDPercent(''); setDReason(''); setDSignature('')
    setDiscountChargeId(prev => (prev === chargeId ? null : chargeId))
  }
  const dPercentNum = Number(dPercent)
  const discountValid = dPercent.trim() !== '' && Number.isFinite(dPercentNum) && dPercentNum > 0 && dPercentNum <= 100
  function submitDiscount(chargeId: string) {
    if (!discountValid || !dSignature.trim()) { setActionError(t('form.required')); return }
    mutate(
      `/api/finance/charges/${chargeId}/discount`, 'POST',
      { percent: dPercentNum, reason: dReason.trim() || null, typed_name: dSignature.trim() },
      () => { setDPercent(''); setDReason(''); setDSignature(''); setDiscountChargeId(null) },
    )
  }

  function methodLabel(method: string | null): string {
    if (method === 'cash') return t('ledger.method_cash')
    if (method === 'transfer') return t('ledger.method_transfer')
    if (method === 'other') return t('ledger.method_other')
    return method || '—'
  }

  const owes = (ledger?.totals.balance ?? 0) > 0.005

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('finance'), href: '/dashboard/finance' },
        { label: fullName || '—' },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('finance'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(5,150,105,0.15)',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 16, fontWeight: 700,
        }}>
          {photoUrl
            ? <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials(fullName)}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{fullName || '—'}</h1>
          {hebrewName && <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>{hebrewName}</div>}
        </div>
        <Link href="/dashboard/finance" style={{ fontSize: 13, color: '#fff', opacity: 0.9, textDecoration: 'underline' }}>
          {tCommon('back')}
        </Link>
      </div>

      {error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      ) : loading || !ledger ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : (
        <>
          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <TotalCard label={t('ledger.balance')} value={fmtMoney(ledger.totals.balance)} color={owes ? '#DC2626' : '#059669'} strong />
            <TotalCard label={t('ledger.charges_total')} value={fmtMoney(ledger.totals.charges_active)} color="var(--text)" />
            <TotalCard label={t('ledger.payments_approved')} value={fmtMoney(ledger.totals.payments_approved)} color="var(--text)" />
            <TotalCard label={t('ledger.payments_pending')} value={fmtMoney(ledger.totals.payments_pending)} color="#D97706" />
            <TotalCard label={t('ledger.discounts_total')} value={fmtMoney(ledger.totals.discounts_total)} color="#7C3AED" />
          </div>

          {actionError && <div style={{ fontSize: 13, color: '#DC2626' }}>{actionError}</div>}

          {/* Charges */}
          <Section
            title={t('ledger.charges_section')}
            action={canCreateInvoice ? { label: t('action.add_charge'), onClick: () => { setShowCharge(v => !v); setShowPayment(false) }, color: primary } : undefined}
          >
            {showCharge && canCreateInvoice && (
              <FormRow>
                <input type="number" step="0.01" min="0" value={cAmount} onChange={e => setCAmount(e.target.value)} placeholder={t('form.amount')} style={inp(120)} />
                <input value={cDesc} onChange={e => setCDesc(e.target.value)} placeholder={t('form.description')} style={inp(220)} />
                <input value={cPeriod} onChange={e => setCPeriod(e.target.value)} placeholder={t('form.period')} style={inp(140)} />
                <input type="date" value={cDue} onChange={e => setCDue(e.target.value)} style={inp(150)} />
                <button onClick={submitCharge} disabled={busy} style={btn(primary)}>{tCommon('save')}</button>
              </FormRow>
            )}
            {ledger.charges.length === 0 ? (
              <Empty text={t('ledger.no_charges')} />
            ) : (
              <Table head={[t('ledger.charge_desc'), t('ledger.charge_period'), t('ledger.charge_due'), t('ledger.charge_amount'), t('ledger.col_status'), '']}>
                {ledger.charges.map(c => {
                  const discTotal = c.discounts.reduce((s, d) => s + d.amount, 0)
                  const remaining = c.amount - discTotal
                  const showDiscounts = c.status === 'active' && c.discounts.length > 0
                  return (
                  <Fragment key={c.id}>
                  <tr>
                    <td style={td}>{c.description}</td>
                    <td style={td}>{c.period_label || '—'}</td>
                    <td style={td}>{c.due_date || '—'}</td>
                    <td style={tdNum}>{fmtMoney(c.amount)}</td>
                    <td style={td}><StatusBadge kind={c.status} label={t(`status.${c.status}`)} /></td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canCreateInvoice && (
                        <RowActionsMenu
                          accentColor={primary}
                          actions={[
                            { key: 'discount', label: t('ledger.give_discount'), onClick: () => openDiscount(c.id), disabled: busy, hidden: c.status !== 'active' },
                            { key: 'cancel', label: t('action.cancel'), onClick: () => { if (confirm(t('confirm.cancel_charge'))) mutate(`/api/finance/charges/${c.id}`, 'PATCH', { status: 'cancelled' }) }, disabled: busy, hidden: c.status !== 'active' },
                            { key: 'delete', label: tCommon('delete'), onClick: () => { if (confirm(t('confirm.delete_charge'))) mutate(`/api/finance/charges/${c.id}`, 'DELETE') }, disabled: busy, danger: true },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                  {showDiscounts && (
                    <tr>
                      <td colSpan={6} style={{ ...td, background: 'var(--surface-2)', paddingTop: 6, paddingBottom: 8 }}>
                        {c.discounts.map(d => (
                          <div key={d.id} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', marginBottom: 3 }}>
                            <span style={{ fontWeight: 600, color: '#7C3AED', fontVariantNumeric: 'tabular-nums' }}>−{fmtMoney(d.amount)} ({d.percent}%)</span>
                            {d.reason && <span>{d.reason}</span>}
                            <span style={{ color: 'var(--text-faint)' }}>
                              {t('ledger.signed_by')
                                .replace('{name}', d.signer_name || d.typed_name || '—')
                                .replace('{date}', (d.signed_at || '').slice(0, 10))}
                            </span>
                          </div>
                        ))}
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                          {t('ledger.remaining')}: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(remaining)}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {canCreateInvoice && discountChargeId === c.id && c.status === 'active' && (
                    <tr>
                      <td colSpan={6} style={{ ...td, padding: 0 }}>
                        <FormRow>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {[10, 25, 50, 100].map(p => (
                              <button key={p} type="button" onClick={() => setDPercent(String(p))} style={{
                                fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                                border: `1px solid ${dPercent === String(p) ? '#7C3AED' : 'var(--border-strong)'}`,
                                background: dPercent === String(p) ? '#7C3AED' : 'transparent',
                                color: dPercent === String(p) ? '#fff' : 'var(--text)',
                              }}>{p}%</button>
                            ))}
                          </div>
                          <input type="number" step="0.01" min="0" max="100" value={dPercent} onChange={e => setDPercent(e.target.value)} placeholder={t('ledger.percent')} style={inp(100)} />
                          <input value={dReason} onChange={e => setDReason(e.target.value)} placeholder={t('ledger.reason_ph')} style={inp(220)} />
                          <input value={dSignature} onChange={e => setDSignature(e.target.value)} placeholder={t('ledger.signature')} style={inp(200)} />
                          <button onClick={() => submitDiscount(c.id)} disabled={busy || !discountValid || !dSignature.trim()} style={{ ...btn('#7C3AED'), opacity: (busy || !discountValid || !dSignature.trim()) ? 0.5 : 1, cursor: (busy || !discountValid || !dSignature.trim()) ? 'default' : 'pointer' }}>{tCommon('save')}</button>
                          <button onClick={() => setDiscountChargeId(null)} disabled={busy} style={{ ...btn('var(--surface-2)'), color: 'var(--text)' }}>{tCommon('cancel')}</button>
                        </FormRow>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  )
                })}
              </Table>
            )}
          </Section>

          {/* Payments */}
          <Section
            title={t('ledger.payments_section')}
            action={canCreateInvoice ? { label: t('action.record_payment'), onClick: () => { setShowPayment(v => !v); setShowCharge(false) }, color: primary } : undefined}
          >
            {showPayment && canCreateInvoice && (
              <FormRow>
                <input type="number" step="0.01" min="0" value={pAmount} onChange={e => setPAmount(e.target.value)} placeholder={t('form.amount')} style={inp(120)} />
                <input type="date" value={pDate} onChange={e => setPDate(e.target.value)} style={inp(150)} />
                <select value={pMethod} onChange={e => setPMethod(e.target.value)} style={inp(150)} aria-label={t('ledger.method')}>
                  <option value="cash">{t('ledger.method_cash')}</option>
                  <option value="transfer">{t('ledger.method_transfer')}</option>
                  <option value="other">{t('ledger.method_other')}</option>
                </select>
                {isTransfer ? (
                  <>
                    <input value={pFromAccount} onChange={e => setPFromAccount(e.target.value)} placeholder={t('ledger.from_account')} style={inp(160)} />
                    <input value={pToAccount} onChange={e => setPToAccount(e.target.value)} placeholder={t('ledger.to_account')} style={inp(160)} />
                  </>
                ) : (
                  <input value={pDepositedTo} onChange={e => setPDepositedTo(e.target.value)} placeholder={t('ledger.deposited_to')} style={inp(200)} />
                )}
                <input value={pRef} onChange={e => setPRef(e.target.value)} placeholder={t('form.reference')} style={inp(150)} />
                <input value={pSignature} onChange={e => setPSignature(e.target.value)} placeholder={t('ledger.signature')} style={inp(200)} />
                <button onClick={submitPayment} disabled={busy || !paymentValid} style={{ ...btn(primary), opacity: (busy || !paymentValid) ? 0.5 : 1, cursor: (busy || !paymentValid) ? 'default' : 'pointer' }}>{tCommon('save')}</button>
              </FormRow>
            )}
            {ledger.payments.length === 0 ? (
              <Empty text={t('ledger.no_payments')} />
            ) : (
              <Table head={[t('ledger.pay_date'), t('ledger.pay_method'), t('ledger.pay_reference'), t('ledger.pay_amount'), t('ledger.col_status'), '']}>
                {ledger.payments.map(p => {
                  const account = p.method === 'transfer'
                    ? [p.from_account, p.to_account].some(Boolean)
                      ? `${p.from_account || '—'} → ${p.to_account || '—'}`
                      : null
                    : (p.deposited_to || null)
                  return (
                  <tr key={p.id}>
                    <td style={td}>
                      {p.paid_at}
                      {p.signed_at && (
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                          {t('ledger.signed_by')
                            .replace('{name}', p.signer_name || p.typed_name || '—')
                            .replace('{date}', (p.signed_at || '').slice(0, 10))}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      {methodLabel(p.method)}
                      {account && (
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{account}</div>
                      )}
                    </td>
                    <td style={td}>{p.reference || '—'}</td>
                    <td style={tdNum}>{fmtMoney(p.amount)}</td>
                    <td style={td}><StatusBadge kind={p.status} label={t(`status.${p.status}`)} /></td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <RowActionsMenu
                        accentColor={primary}
                        actions={[
                          { key: 'approve', label: t('action.approve'), onClick: () => { if (confirm(t('confirm.approve_payment'))) mutate(`/api/finance/payments/${p.id}/approve`, 'POST') }, disabled: busy, hidden: !(canApprove && p.status === 'pending') },
                          { key: 'cancel', label: t('action.cancel'), onClick: () => { if (confirm(t('confirm.cancel_payment'))) mutate(`/api/finance/payments/${p.id}`, 'PATCH', { status: 'cancelled' }) }, disabled: busy, danger: true, hidden: !(canCreateInvoice && p.status !== 'cancelled') },
                        ]}
                      />
                    </td>
                  </tr>
                  )
                })}
              </Table>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

// ── Small presentational helpers ──────────────────────────────────────────────

const td: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '9px 12px', borderBottom: '1px solid var(--surface-2)' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

function inp(width: number): React.CSSProperties {
  return { width, fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' }
}
function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}

function TotalCard({ label, value, color, strong }: { label: string; value: string; color: string; strong?: boolean }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: strong ? 24 : 18, fontWeight: 700, color, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function Section({ title, action, children }: {
  title: string
  action?: { label: string; onClick: () => void; color: string }
  children: React.ReactNode
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{title}</h2>
        {action && (
          <button onClick={action.onClick} style={{
            fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8,
            border: `1px solid ${action.color}`, background: 'transparent', color: action.color, cursor: 'pointer',
          }}>
            + {action.label}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function FormRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14, padding: 12, background: 'var(--surface-2)', borderRadius: 8 }}>
      {children}
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>{head.map((h, i) => (
            <th key={i} style={i === 3 ? { ...th, textAlign: 'right' } : th}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '4px 2px' }}>{text}</div>
}

function StatusBadge({ kind, label }: { kind: 'active' | 'cancelled' | 'pending' | 'approved'; label: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    active:    { bg: '#D1FAE5', fg: '#047857' },
    approved:  { bg: '#D1FAE5', fg: '#047857' },
    pending:   { bg: '#FEF3C7', fg: '#B45309' },
    cancelled: { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
  }
  const c = palette[kind] ?? palette.cancelled
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 9px',
      borderRadius: 999, background: c.bg, color: c.fg,
    }}>
      {label}
    </span>
  )
}
