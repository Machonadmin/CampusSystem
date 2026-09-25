import type { SessionPayload } from '@/lib/auth/jwt'
import { hasFinancePrivilege, getFinancePrivilegeScope, type FinancePrivilege } from './permissions'
import { createServerClient } from '@/lib/supabase/server'
import { getUserDepartmentIds } from '@/lib/education/permissions'
import { todayISO } from '@/lib/dates'
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

/**
 * Разделение обязанностей (red-team 2026-09-25): сотрудник финансов НЕ создаёт,
 * не меняет, не удаляет и не утверждает СОБСТВЕННУЮ зарплату (тарифы, записи,
 * расчётный лист). Иначе держатель create_invoice/approve_payment мог начислить
 * и утвердить себе выплату. Исключение — superadmin (владелец системы).
 */
export function isSelfCompTarget(session: SessionPayload, personId: string | null | undefined): boolean {
  if (session.roles.includes('superadmin')) return false
  return !!personId && personId === session.person_id
}

/**
 * Проверка ПО СОТРУДНИКУ (red-team 2026-09-25): раньше хватало иметь право
 * finance.* где угодно, и можно было читать/менять зарплату любого personId.
 * Теперь scope права сравнивается с подразделениями сотрудника:
 *   • superadmin / scope='all' → любой сотрудник;
 *   • scope='department' → у сотрудника есть действующая позиция в одном из
 *     подразделений проверяющего (включая под-единицы);
 *   • иначе / сотрудник без позиций → нет.
 */
export async function canAccessStaffCompPerson(
  session: SessionPayload,
  personId: string,
  privilege: FinancePrivilege,
): Promise<boolean> {
  if (session.principal === 'student') return false
  if (session.roles.includes('superadmin')) return true
  const scope = await getFinancePrivilegeScope(session, privilege)
  if (scope === 'all') return true
  if (scope !== 'department') return false
  const myDepts = await getUserDepartmentIds(session.person_id)
  if (myDepts.length === 0) return false
  const sb = createServerClient()
  const { data, error } = await sb.from('staff_positions')
    .select('department_id, end_date').eq('person_id', personId)
  if (error || !data) return false
  const today = todayISO()
  return data.some(r => (r.end_date === null || r.end_date > today)
    && !!r.department_id && myDepts.includes(r.department_id))
}

/** Границы месяца [from, to] в ISO 'YYYY-MM-DD' (to — включительно, последний день). */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const p = (n: number) => String(n).padStart(2, '0')
  const from = `${year}-${p(month)}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate() // month здесь 1..12 → day 0 = последний день
  const to = `${year}-${p(month)}-${p(lastDay)}`
  return { from, to }
}

// lessonHours вынесен в чистый модуль (без серверных импортов), чтобы его
// могли использовать lib/education/teacher-hours.ts и юнит-тесты. Реэкспорт
// сохраняет прежний импорт '@/lib/finance/staff-comp'.
export { lessonHours } from './lesson-hours'

/** Сумма стоимости записей (amount) в валюте, через целые копейки (без float-дрейфа). */
export function sumEntries(entries: { amount: number | string | null }[]): number {
  const cents = entries.reduce((acc, e) => acc + (e.amount == null ? 0 : toCents(e.amount)), 0)
  return centsToNumber(cents)
}
