'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// ── Types (mirror the ledger API response) ──────────────────────────────────

interface Charge {
  id: string
  amount: number
  description: string
  period_label: string | null
  due_date: string | null
  status: 'active' | 'cancelled'
}
interface Payment {
  id: string
  amount: number
  paid_at: string
  method: string | null
  reference: string | null
  status: 'pending' | 'approved' | 'cancelled'
  approved_at: string | null
}
interface Totals {
  charges_active: number
  payments_approved: number
  payments_pending: number
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
  const [pMethod, setPMethod] = useState('')
  const [pRef, setPRef] = useState('')

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
  function submitPayment() {
    if (!pAmount.trim() || !pDate) { setActionError(t('form.required')); return }
    mutate(
      `/api/finance/journeys/${journeyId}/payments`, 'POST',
      { amount: Number(pAmount), paid_at: pDate, method: pMethod.trim() || null, reference: pRef.trim() || null },
      () => { setPAmount(''); setPDate(''); setPMethod(''); setPRef(''); setShowPayment(false) },
    )
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
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{tCommon('loading')}</div>
      ) : (
        <>
          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <TotalCard label={t('ledger.balance')} value={fmtMoney(ledger.totals.balance)} color={owes ? '#DC2626' : '#059669'} strong />
            <TotalCard label={t('ledger.charges_total')} value={fmtMoney(ledger.totals.charges_active)} color="#1F2937" />
            <TotalCard label={t('ledger.payments_approved')} value={fmtMoney(ledger.totals.payments_approved)} color="#1F2937" />
            <TotalCard label={t('ledger.payments_pending')} value={fmtMoney(ledger.totals.payments_pending)} color="#D97706" />
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
                {ledger.charges.map(c => (
                  <tr key={c.id}>
                    <td style={td}>{c.description}</td>
                    <td style={td}>{c.period_label || '—'}</td>
                    <td style={td}>{c.due_date || '—'}</td>
                    <td style={tdNum}>{fmtMoney(c.amount)}</td>
                    <td style={td}><StatusBadge kind={c.status} label={t(`status.${c.status}`)} /></td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canCreateInvoice && c.status === 'active' && (
                        <ActionLink onClick={() => { if (confirm(t('confirm.cancel_charge'))) mutate(`/api/finance/charges/${c.id}`, 'PATCH', { status: 'cancelled' }) }} disabled={busy} color="#D97706">{t('action.cancel')}</ActionLink>
                      )}
                      {canCreateInvoice && (
                        <ActionLink onClick={() => { if (confirm(t('confirm.delete_charge'))) mutate(`/api/finance/charges/${c.id}`, 'DELETE') }} disabled={busy} color="#DC2626">{tCommon('delete')}</ActionLink>
                      )}
                    </td>
                  </tr>
                ))}
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
                <input value={pMethod} onChange={e => setPMethod(e.target.value)} placeholder={t('form.method')} style={inp(150)} />
                <input value={pRef} onChange={e => setPRef(e.target.value)} placeholder={t('form.reference')} style={inp(150)} />
                <button onClick={submitPayment} disabled={busy} style={btn(primary)}>{tCommon('save')}</button>
              </FormRow>
            )}
            {ledger.payments.length === 0 ? (
              <Empty text={t('ledger.no_payments')} />
            ) : (
              <Table head={[t('ledger.pay_date'), t('ledger.pay_method'), t('ledger.pay_reference'), t('ledger.pay_amount'), t('ledger.col_status'), '']}>
                {ledger.payments.map(p => (
                  <tr key={p.id}>
                    <td style={td}>{p.paid_at}</td>
                    <td style={td}>{p.method || '—'}</td>
                    <td style={td}>{p.reference || '—'}</td>
                    <td style={tdNum}>{fmtMoney(p.amount)}</td>
                    <td style={td}><StatusBadge kind={p.status} label={t(`status.${p.status}`)} /></td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canApprove && p.status === 'pending' && (
                        <ActionLink onClick={() => { if (confirm(t('confirm.approve_payment'))) mutate(`/api/finance/payments/${p.id}/approve`, 'POST') }} disabled={busy} color="#059669">{t('action.approve')}</ActionLink>
                      )}
                      {canCreateInvoice && p.status !== 'cancelled' && (
                        <ActionLink onClick={() => { if (confirm(t('confirm.cancel_payment'))) mutate(`/api/finance/payments/${p.id}`, 'PATCH', { status: 'cancelled' }) }} disabled={busy} color="#D97706">{t('action.cancel')}</ActionLink>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

// ── Small presentational helpers ──────────────────────────────────────────────

const td: React.CSSProperties = { fontSize: 13, color: '#1F2937', padding: '9px 12px', borderBottom: '1px solid #F3F4F6' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

function inp(width: number): React.CSSProperties {
  return { width, fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937' }
}
function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}

function TotalCard({ label, value, color, strong }: { label: string; value: string; color: string; strong?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
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
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>{title}</h2>
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
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14, padding: 12, background: '#F9FAFB', borderRadius: 8 }}>
      {children}
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px',
    borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
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
  return <div style={{ fontSize: 13, color: '#9CA3AF', padding: '4px 2px' }}>{text}</div>
}

function StatusBadge({ kind, label }: { kind: 'active' | 'cancelled' | 'pending' | 'approved'; label: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    active:    { bg: '#D1FAE5', fg: '#047857' },
    approved:  { bg: '#D1FAE5', fg: '#047857' },
    pending:   { bg: '#FEF3C7', fg: '#B45309' },
    cancelled: { bg: '#F3F4F6', fg: '#6B7280' },
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

function ActionLink({ onClick, disabled, color, children }: {
  onClick: () => void; disabled?: boolean; color: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: 'none', border: 'none', color, cursor: disabled ? 'default' : 'pointer',
      fontSize: 12, fontWeight: 600, padding: '2px 6px', opacity: disabled ? 0.5 : 1,
    }}>
      {children}
    </button>
  )
}
