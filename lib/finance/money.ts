// ─── Денежная арифметика ────────────────────────────────────────────────────
//
// amount хранится как NUMERIC(12,2); суммируем через целые копейки, чтобы
// избежать дрейфа float (0.1 + 0.2 ≠ 0.3). PostgREST может отдать numeric
// строкой — поэтому Number(...) перед округлением.

/** amount (число или строка от PostgREST) → целые копейки. */
export function toCents(amount: number | string): number {
  return Math.round(Number(amount) * 100)
}

/** Сумма amount по массиву строк, в копейках (целое). */
export function sumCents(rows: { amount: number | string }[]): number {
  return rows.reduce((acc, r) => acc + toCents(r.amount), 0)
}

/** Копейки → рубли/шекели с двумя знаками (число). */
export function centsToNumber(cents: number): number {
  return Math.round(cents) / 100
}

interface ChargeRow { amount: number | string; status: string }
interface PaymentRow { amount: number | string; status: string }

/**
 * Итоги ПНК студента по правилу баланса:
 *   balance = Σ(charges active) − Σ(discounts на active-счета) − Σ(payments approved)
 * Всё считается в целых копейках (без float-дрейфа), на выходе — числа с двумя
 * знаками. Скидки (finance_discounts) уменьшают долг; передавать нужно скидки,
 * относящиеся к АКТИВНЫМ счетам (фильтрует вызывающий ledger-роут). Баланс не
 * опускается ниже суммы после скидок, но сам по себе может быть отрицательным
 * при переплате — это ок. Извлечено из ledger-роута для юнит-покрытия правила.
 */
export function computeLedgerTotals(
  charges: ChargeRow[],
  payments: PaymentRow[],
  discounts: { amount: number | string }[] = [],
): {
  charges_active: number
  payments_approved: number
  payments_pending: number
  discounts_total: number
  balance: number
} {
  const chargesActiveCents = sumCents(charges.filter(c => c.status === 'active'))
  const paymentsApprovedCents = sumCents(payments.filter(p => p.status === 'approved'))
  const paymentsPendingCents = sumCents(payments.filter(p => p.status === 'pending'))
  const discountsCents = sumCents(discounts)
  return {
    charges_active: centsToNumber(chargesActiveCents),
    payments_approved: centsToNumber(paymentsApprovedCents),
    payments_pending: centsToNumber(paymentsPendingCents),
    discounts_total: centsToNumber(discountsCents),
    balance: centsToNumber(chargesActiveCents - discountsCents - paymentsApprovedCents),
  }
}
