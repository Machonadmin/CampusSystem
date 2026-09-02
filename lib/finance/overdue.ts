/**
 * Просрочка оплаты (spec §3.9): «מועד שעבר → נוצר student_alert type
 * financial_debt». Чистая функция — переиспользует баланс из computeLedgerTotals
 * (согласованность с существующим финмодулем) и активные начисления.
 *
 * Студентка «в просрочке», если её баланс > 0 И есть активное начисление со
 * сроком (due_date) в прошлом. balance — итоговый баланс (начислено − скидки −
 * подтверждённые оплаты).
 */
export interface ChargeDue {
  due_date: string | null
  status: string
}

export function isJourneyOverdue(balance: number, charges: ChargeDue[], todayISO: string): boolean {
  if (balance <= 0) return false
  return charges.some(c => c.status === 'active' && c.due_date != null && c.due_date < todayISO)
}
