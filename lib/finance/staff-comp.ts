import type { SessionPayload } from '@/lib/auth/jwt'
import { hasFinancePrivilege } from './permissions'
import { toCents, centsToNumber } from './money'

/**
 * Доступ к зарплатам сотрудников (שכר צוות). Управляется как часть финансов:
 *   • просмотр карточки/лоза/расчётного листа — finance.view (или superadmin);
 *   • изменение тарифов / записей — finance.create_invoice;
 *   • утверждение расчётного листа — finance.approve_payment (менеджер).
 * Отдельно от учебного доступа: аחראит лимудим сюда не входит.
 */
export async function canViewStaffComp(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false
  if (session.roles.includes('superadmin')) return true
  return hasFinancePrivilege(session, 'view')
}
export async function canManageStaffComp(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false
  if (session.roles.includes('superadmin')) return true
  return hasFinancePrivilege(session, 'create_invoice')
}
export async function canApprovePayslip(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false
  if (session.roles.includes('superadmin')) return true
  return hasFinancePrivilege(session, 'approve_payment')
}

/** Границы месяца [from, to] в ISO 'YYYY-MM-DD' (to — включительно, последний день). */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const p = (n: number) => String(n).padStart(2, '0')
  const from = `${year}-${p(month)}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate() // month здесь 1..12 → day 0 = последний день
  const to = `${year}-${p(month)}-${p(lastDay)}`
  return { from, to }
}

/**
 * Длительность урока в часах из времени начала/конца ('HH:MM[:SS]'). Пересечение
 * полуночи не ожидается; при отсутствии/некорректности — null. Чистая функция.
 */
export function lessonHours(startTime: string | null, endTime: string | null): number | null {
  if (!startTime || !endTime) return null
  const mins = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return h * 60 + m
  }
  const s = mins(startTime), e = mins(endTime)
  if (s === null || e === null || e <= s) return null
  return Math.round(((e - s) / 60) * 100) / 100
}

/** Сумма стоимости записей (amount) в валюте, через целые копейки (без float-дрейфа). */
export function sumEntries(entries: { amount: number | string | null }[]): number {
  const cents = entries.reduce((acc, e) => acc + (e.amount == null ? 0 : toCents(e.amount)), 0)
  return centsToNumber(cents)
}
