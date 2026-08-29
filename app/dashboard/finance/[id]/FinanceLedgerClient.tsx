'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'
import { RowActionsMenu } from '@/components/ui/RowActionsMenu'
import { PhoneLink } from '@/components/ui/PhoneLink'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { formatMoney } from '@/lib/finance/money'

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
interface Contract {
  id: string
  tuition_discount_percent: number | null
  support_amount: number | null
  benefits_notes: string | null
  status: string
  created_at: string
}
interface Ledger {
  charges: Charge[]
  payments: Payment[]
  totals: Totals
  suggested_discount_percent?: number | null
  contract?: Contract | null
}

interface Props {
  journeyId: string
  fullName: string
  hebrewName: string | null
  photoUrl: string | null
  phones?: string[]
  canCreateInvoice: boolean
  canApprove: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '—'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FinanceLedgerClient({
  journeyId, fullName, hebrewName, photoUrl, phones = [], canCreateInvoice, canApprove,
}: Props) {
  const t = useTranslations('finance')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const { lang } = useLang()

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
      setLedger({
        charges: body.charges ?? [],
        payments: body.payments ?? [],
        totals: body.totals,
        suggested_discount_percent: body.suggested_discount_percent ?? null,
        contract: body.contract ?? null,
      })
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
        toastError(b.error ?? t('ledger.action_failed'))
        return
      }
      after?.()
      await load()
    } catch {
      toastError(t('ledger.action_failed'))
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
        toastSuccess(tCommon('saved'))
      },
    )
  }

  const suggestedDiscount = ledger?.suggested_discount_percent ?? null
  function openDiscount(chargeId: string) {
    setActionError(null)
    // Предзаполняем рекомендованной скидкой из профиля (проверка еврейства).
    setDPercent(suggestedDiscount != null ? String(suggestedDiscount) : '')
    setDReason(''); setDSignature('')
    setDiscountChargeId(prev => (prev === chargeId ? null : chargeId))
  }
  const dPercentNum = Number(dPercent)
  const discountValid = dPercent.trim() !== '' && Number.isFinite(dPercentNum) && dPercentNum > 0 && dPercentNum <= 100
  function submitDiscount(chargeId: string) {
    if (!discountValid || !dSignature.trim()) { setActionError(t('form.required')); return }
    mutate(
      `/api/finance/charges/${chargeId}/discount`, 'POST',
      { percent: dPercentNum, reason: dReason.trim() || null, typed_name: dSignature.trim() },
      () => { setDPercent(''); setDReason(''); setDSignature(''); setDiscountChargeId(null); toastSuccess(tCommon('saved')) },
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
        borderRadius: 14, padding: '16px 24px', color: '#fff',
        boxShadow: 'var(--shadow)',
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
          {/* Телефон прямо в шапке ПНК: экран, где смотрят на долг, — тот, откуда звонят. */}
          {phones[0] && (
            <div style={{ fontSize: 13, marginTop: 4 }}>
              <PhoneLink phone={phones[0]} style={{ color: '#fff' }} />
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</div>
      ) : loading || !ledger ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : (
        <>
          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <TotalCard label={t('ledger.balance')} value={formatMoney(ledger.totals.balance)} color={owes ? 'var(--danger)' : 'var(--success)'} strong />
            <TotalCard label={t('ledger.charges_total')} value={formatMoney(ledger.totals.charges_active)} color="var(--text)" />
            <TotalCard label={t('ledger.payments_approved')} value={formatMoney(ledger.totals.payments_approved)} color="var(--text)" />
            <TotalCard label={t('ledger.payments_pending')} value={formatMoney(ledger.totals.payments_pending)} color="var(--warn)" />
            <TotalCard label={t('ledger.discounts_total')} value={formatMoney(ledger.totals.discounts_total)} color="var(--violet)" />
          </div>

          {ledger.contract && (
            <div style={{ border: '1px solid var(--accent-strong)', background: 'var(--success-tint)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-strong)' }}>{t('ledger.contract_title')}</span>
              {ledger.contract.tuition_discount_percent != null && (
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{t('ledger.contract_discount')}: <b>{ledger.contract.tuition_discount_percent}%</b></span>
              )}
              {ledger.contract.support_amount != null && (
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{t('ledger.contract_support')}: <b>{formatMoney(ledger.contract.support_amount)}</b></span>
              )}
              {ledger.contract.benefits_notes && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{ledger.contract.benefits_notes}</span>
              )}
            </div>
          )}

          {actionError && <div style={{ fontSize: 13, color: 'var(--danger)' }}>{actionError}</div>}

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
                <SubmitButton onClick={submitCharge} loading={busy} style={btn(primary)}>{tCommon('save')}</SubmitButton>
              </FormRow>
            )}
            {ledger.charges.length === 0 ? (
              <Empty text={t('ledger.no_charges')} />
            ) : (
              <Table cardsSm head={[t('ledger.charge_desc'), t('ledger.charge_period'), t('ledger.charge_due'), t('ledger.charge_amount'), t('ledger.col_status'), '']}>
                {ledger.charges.map(c => {
                  const discTotal = c.discounts.reduce((s, d) => s + d.amount, 0)
                  const remaining = c.amount - discTotal
                  const showDiscounts = c.status === 'active' && c.discounts.length > 0
                  return (
                  <Fragment key={c.id}>
                  <tr>
                    <td data-label={t('ledger.charge_desc')} style={td}>{c.description}</td>
                    <td data-label={t('ledger.charge_period')} style={td}>{c.period_label || '—'}</td>
                    <td data-label={t('ledger.charge_due')} style={td}>{c.due_date ? formatDate(c.due_date, lang) : '—'}</td>
                    <td data-label={t('ledger.charge_amount')} style={tdNum}>{formatMoney(c.amount)}</td>
                    <td data-label={t('ledger.col_status')} style={td}><StatusBadge kind={c.status} label={t(`status.${c.status}`)} /></td>
                    <td data-label="" style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canCreateInvoice && (
                        <RowActionsMenu
                          accentColor={primary}
                          actions={[
                            { key: 'discount', label: t('ledger.give_discount'), onClick: () => openDiscount(c.id), disabled: busy, hidden: c.status !== 'active' },
                            { key: 'cancel', label: t('action.cancel'), onClick: async () => { if (await confirmDialog({ message: t('confirm.cancel_charge'), tone: 'danger' })) mutate(`/api/finance/charges/${c.id}`, 'PATCH', { status: 'cancelled' }) }, disabled: busy, hidden: c.status !== 'active' },
                            { key: 'delete', label: tCommon('delete'), onClick: async () => { if (await confirmDialog({ message: t('confirm.delete_charge'), tone: 'danger' })) mutate(`/api/finance/charges/${c.id}`, 'DELETE') }, disabled: busy, danger: true },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                  {showDiscounts && (
                    <tr>
                      <td data-label="" colSpan={6} style={{ ...td, background: 'var(--surface-2)', paddingTop: 6, paddingBottom: 8 }}>
                        {c.discounts.map(d => (
                          <div key={d.id} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', marginBottom: 3 }}>
                            <span style={{ fontWeight: 600, color: 'var(--violet)', fontVariantNumeric: 'tabular-nums' }}>−{formatMoney(d.amount)} ({d.percent}%)</span>
                            {d.reason && <span>{d.reason}</span>}
                            <span style={{ color: 'var(--text-faint)' }}>
                              {t('ledger.signed_by')
                                .replace('{name}', d.signer_name || d.typed_name || '—')
                                .replace('{date}', formatDate((d.signed_at || '').slice(0, 10), lang))}
                            </span>
                          </div>
                        ))}
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                          {t('ledger.remaining')}: <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(remaining)}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {canCreateInvoice && discountChargeId === c.id && c.status === 'active' && (
                    <tr>
                      <td data-label="" colSpan={6} style={{ ...td, padding: 0 }}>
                        <FormRow>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {[10, 25, 50, 100].map(p => (
                              <button key={p} type="button" onClick={() => setDPercent(String(p))} style={{
                                fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                                border: `1px solid ${dPercent === String(p) ? 'var(--violet)' : 'var(--border-strong)'}`,
                                background: dPercent === String(p) ? 'var(--violet)' : 'transparent',
                                color: dPercent === String(p) ? '#fff' : 'var(--text)',
                              }}>{p}%</button>
                            ))}
                          </div>
                          {suggestedDiscount != null && (
                            <button type="button" onClick={() => setDPercent(String(suggestedDiscount))} style={{
                              fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
                              border: '1px solid var(--accent-strong)', background: dPercent === String(suggestedDiscount) ? 'var(--accent-strong)' : 'var(--accent-tint)',
                              color: dPercent === String(suggestedDiscount) ? '#fff' : 'var(--accent-strong)',
                            }} title={t('ledger.suggested_discount_hint')}>{t('ledger.suggested_discount')}: {suggestedDiscount}%</button>
                          )}
                          <input type="number" step="0.01" min="0" max="100" value={dPercent} onChange={e => setDPercent(e.target.value)} placeholder={t('ledger.percent')} style={inp(100)} />
                          <input value={dReason} onChange={e => setDReason(e.target.value)} placeholder={t('ledger.reason_ph')} style={inp(220)} />
                          <input value={dSignature} onChange={e => setDSignature(e.target.value)} placeholder={t('ledger.signature')} style={inp(200)} />
                          <SubmitButton onClick={() => submitDiscount(c.id)} loading={busy} disabled={busy || !discountValid || !dSignature.trim()} style={{ ...btn('var(--violet)'), opacity: (busy || !discountValid || !dSignature.trim()) ? 0.5 : 1, cursor: (busy || !discountValid || !dSignature.trim()) ? 'default' : 'pointer' }}>{tCommon('save')}</SubmitButton>
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
                <SubmitButton onClick={submitPayment} loading={busy} disabled={busy || !paymentValid} style={{ ...btn(primary), opacity: (busy || !paymentValid) ? 0.5 : 1, cursor: (busy || !paymentValid) ? 'default' : 'pointer' }}>{tCommon('save')}</SubmitButton>
              </FormRow>
            )}
            {ledger.payments.length === 0 ? (
              <Empty text={t('ledger.no_payments')} />
            ) : (
              <Table cardsSm head={[t('ledger.pay_date'), t('ledger.pay_method'), t('ledger.pay_reference'), t('ledger.pay_amount'), t('ledger.col_status'), '']}>
                {ledger.payments.map(p => {
                  const account = p.method === 'transfer'
                    ? [p.from_account, p.to_account].some(Boolean)
                      ? `${p.from_account || '—'} → ${p.to_account || '—'}`
                      : null
                    : (p.deposited_to || null)
                  return (
                  <tr key={p.id}>
                    <td data-label={t('ledger.pay_date')} style={td}>
                      {p.paid_at ? formatDate(p.paid_at, lang) : '—'}
                      {p.signed_at && (
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                          {t('ledger.signed_by')
                            .replace('{name}', p.signer_name || p.typed_name || '—')
                            .replace('{date}', formatDate((p.signed_at || '').slice(0, 10), lang))}
                        </div>
                      )}
                    </td>
                    <td data-label={t('ledger.pay_method')} style={td}>
                      {methodLabel(p.method)}
                      {account && (
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{account}</div>
                      )}
                    </td>
                    <td data-label={t('ledger.pay_reference')} style={td}>{p.reference || '—'}</td>
                    <td data-label={t('ledger.pay_amount')} style={tdNum}>{formatMoney(p.amount)}</td>
                    <td data-label={t('ledger.col_status')} style={td}><StatusBadge kind={p.status} label={t(`status.${p.status}`)} /></td>
                    <td data-label="" style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <RowActionsMenu
                        accentColor={primary}
                        actions={[
                          { key: 'approve', label: t('action.approve'), onClick: async () => { if (await confirmDialog({ message: t('confirm.approve_payment') })) mutate(`/api/finance/payments/${p.id}/approve`, 'POST') }, disabled: busy, hidden: !(canApprove && p.status === 'pending') },
                          { key: 'receipt', label: t('ledger.print_receipt'), onClick: () => { window.open(`/dashboard/finance/receipt/${p.id}`, '_blank') }, hidden: p.status !== 'approved' },
                          { key: 'cancel', label: t('action.cancel'), onClick: async () => { if (await confirmDialog({ message: t('confirm.cancel_payment'), tone: 'danger' })) mutate(`/api/finance/payments/${p.id}`, 'PATCH', { status: 'cancelled' }) }, disabled: busy, danger: true, hidden: !(canCreateInvoice && p.status !== 'cancelled') },
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

function Table({ head, cardsSm, children }: { head: string[]; cardsSm?: boolean; children: React.ReactNode }) {
  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className={cardsSm ? 'cards-sm' : undefined} style={{ width: '100%', borderCollapse: 'collapse' }}>
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
    active:    { bg: 'var(--success-tint)', fg: 'var(--success)' },
    approved:  { bg: 'var(--success-tint)', fg: 'var(--success)' },
    pending:   { bg: 'var(--warn-tint)', fg: 'var(--warn)' },
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
