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
