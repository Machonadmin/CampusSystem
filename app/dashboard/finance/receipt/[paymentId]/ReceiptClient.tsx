'use client'

import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { intlLocale } from '@/lib/i18n/format-date'
import { formatMoney } from '@/lib/finance/money'

interface Payment {
  id: string
  amount: number
  paid_at: string | null
  method: string | null
  reference: string | null
  status: 'pending' | 'approved' | 'cancelled'
  approved_at: string | null
  deposited_to: string | null
  from_account: string | null
  to_account: string | null
  signer_name: string | null
  typed_name: string | null
  signed_at: string | null
}

interface Props {
  payment: Payment
  journeyId: string
  studentName: string
  studentHebrewName: string | null
}

function fmtDate(d: string | null, lang: string): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(intlLocale(lang), { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Печатная квитанция. Печать — window.print(); стили @media print скрывают
 * навигацию/кнопки и разворачивают лист на всю ширину. RTL наследуется от html.
 */
export default function ReceiptClient({ payment, journeyId, studentName, studentHebrewName }: Props) {
  const t = useTranslations('finance.receipt')
  const tLedger = useTranslations('finance.ledger')
  const { lang } = useLang()

  const p = payment
  const methodLabel = p.method === 'cash' ? tLedger('method_cash')
    : p.method === 'transfer' ? tLedger('method_transfer')
    : p.method === 'other' ? tLedger('method_other')
    : (p.method || '—')

  const account = p.method === 'transfer'
    ? ([p.from_account, p.to_account].some(Boolean) ? `${p.from_account || '—'} → ${p.to_account || '—'}` : null)
    : (p.deposited_to || null)

  const signer = p.signer_name || p.typed_name || null
  // Короткий человекочитаемый номер квитанции из UUID платежа.
  const receiptNo = p.id.slice(0, 8).toUpperCase()

  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }
  const rowLabel: React.CSSProperties = { color: 'var(--text-muted)', fontWeight: 600 }
  const rowVal: React.CSSProperties = { color: 'var(--text)', textAlign: 'end' as const }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Панель действий — не печатается */}
      <div className="receipt-actions" style={{ width: '100%', maxWidth: 620, display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <a href={`/dashboard/finance/${journeyId}`} style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← {t('back')}
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          style={{ fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--accent-strong)', color: '#fff', cursor: 'pointer' }}
        >
          {t('print')}
        </button>
      </div>

      {p.status !== 'approved' && (
        <div className="receipt-actions" style={{ width: '100%', maxWidth: 620, marginBottom: 16, fontSize: 13, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn)', borderRadius: 8, padding: '10px 14px' }}>
          {t('not_approved_warning')}
        </div>
      )}

      {/* Лист квитанции */}
      <div className="receipt-sheet" style={{
        width: '100%', maxWidth: 620, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 32, boxShadow: 'var(--shadow)',
      }}>
        {/* Шапка */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid var(--accent-strong)', paddingBottom: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{t('institution')}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent-strong)', marginTop: 6 }}>{t('title')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>
            {t('receipt_no')}: {receiptNo}
          </div>
        </div>

        {/* Кому */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('received_from')}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>
            {studentName || '—'}
            {studentHebrewName && <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginInlineStart: 8 }}>{studentHebrewName}</span>}
          </div>
        </div>

        {/* Сумма — крупно */}
        <div style={{ background: 'var(--success-tint)', borderRadius: 10, padding: '16px 20px', textAlign: 'center', margin: '16px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{t('amount_paid')}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--success)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.amount)}</div>
        </div>

        {/* Реквизиты */}
        <div>
          <div style={row}><span style={rowLabel}>{t('payment_date')}</span><span style={rowVal}>{fmtDate(p.paid_at, lang)}</span></div>
          <div style={row}><span style={rowLabel}>{tLedger('pay_method')}</span><span style={rowVal}>{methodLabel}</span></div>
          {account && <div style={row}><span style={rowLabel}>{p.method === 'transfer' ? t('account') : tLedger('deposited_to')}</span><span style={rowVal}>{account}</span></div>}
          {p.reference && <div style={row}><span style={rowLabel}>{tLedger('pay_reference')}</span><span style={rowVal}>{p.reference}</span></div>}
          {p.approved_at && <div style={row}><span style={rowLabel}>{t('approved_at')}</span><span style={rowVal}>{fmtDate(p.approved_at, lang)}</span></div>}
        </div>

        {/* Подпись */}
        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ borderTop: '1px solid var(--text-muted)', paddingTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              {t('signature')}
            </div>
            {signer && <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{signer}</div>}
            {p.signed_at && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{fmtDate(p.signed_at, lang)}</div>}
          </div>
          <div style={{ width: 90, height: 90, borderRadius: '50%', border: '2px dashed var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-faint)', textAlign: 'center', flexShrink: 0 }}>
            {t('stamp')}
          </div>
        </div>
      </div>

      {/* Печать: убираем действия/тени, разворачиваем лист */}
      <style>{`
        @media print {
          .receipt-actions { display: none !important; }
          .receipt-sheet {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
            border-radius: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
