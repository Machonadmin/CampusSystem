import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionPayload } from '@/lib/auth/jwt'
import { createServerClient } from '@/lib/supabase/server'
import { hasFinancePrivilege } from './permissions'

/**
 * Доступ к финансам КОНКРЕТНОЙ студентки — ОТДЕЛЬНЫЙ от доступа к её делу.
 * По требованию владельца: аחראית לимудим (глава учёбы) НЕ видит финансы, даже
 * имея доступ к делу студентки. Финансовый доступ выдаёт менеджер точечно:
 *   • глобально (все студентки), либо
 *   • на ОДНУ конкретную студентку (journey).
 *
 * Кто имеет доступ к финансам студентки (view/manage):
 *   1) superadmin;
 *   2) штатный финотдел — привилегия finance.view / finance.create_invoice
 *      (scope != own), т.е. существующий глобальный финансовый доступ;
 *   3) персональный grant (finance_access_grants): scope='all' или
 *      scope='journey' на эту journey.
 *
 * Студентка в портале финансы НЕ видит — только если менеджер разрешил лично
 * (education_journeys.student_finance_visible); проверяется в портальных роутах.
 *
 * Деплой-безопасно: до применения миграции grants ещё нет (42P01) → грантов нет.
 */

function untyped(sb: ReturnType<typeof createServerClient>) {
  return sb as unknown as SupabaseClient
}

/** Есть ли у person персональный грант (scope='all' или на эту journey). */
async function hasFinanceGrant(personId: string, journeyId: string): Promise<boolean> {
  const sb = createServerClient()
  try {
    const { data, error } = await untyped(sb)
      .from('finance_access_grants')
      .select('scope, journey_id')
      .eq('person_id', personId)
    if (error) throw error
    for (const g of (data ?? []) as Array<{ scope: string; journey_id: string | null }>) {
      if (g.scope === 'all') return true
      if (g.scope === 'journey' && g.journey_id === journeyId) return true
    }
    return false
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return false
    throw e
  }
}

/** Может ли пользователь ВИДЕТЬ финансы этой студентки. */
export async function canViewStudentFinance(session: SessionPayload | null, journeyId: string): Promise<boolean> {
  if (!session) return false
  if (session.roles.includes('superadmin')) return true
  if (await hasFinancePrivilege(session, 'view')) return true
  return hasFinanceGrant(session.person_id, journeyId)
}

/** Может ли пользователь ИЗМЕНЯТЬ финансы этой студентки (счета/платежи/скидки). */
export async function canManageStudentFinance(session: SessionPayload | null, journeyId: string): Promise<boolean> {
  if (!session) return false
  if (session.roles.includes('superadmin')) return true
  if (await hasFinancePrivilege(session, 'create_invoice')) return true
  return hasFinanceGrant(session.person_id, journeyId)
}

/**
 * Кто может ВЫДАВАТЬ/СНИМАТЬ финансовый доступ («менеджер»): superadmin или
 * держатель finance.approve_payment (менеджерский уровень финмодуля).
 */
export async function canManageFinanceAccess(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false
  if (session.roles.includes('superadmin')) return true
  return hasFinancePrivilege(session, 'approve_payment')
}
