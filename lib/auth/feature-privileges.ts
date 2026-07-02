import { createServerClient } from '@/lib/supabase/server'
import { getSession } from './session'
import type { SessionPayload } from './jwt'

/**
 * Проверка прав через feature_privileges (role_code + module_code +
 * feature_code → can_view/can_create/can_edit/can_delete). Это отдельная,
 * более гранулярная таблица от role_privileges/module_privileges
 * (см. lib/auth/module-privileges.ts) — используется там, где модуль уже
 * делится на вкладки/фичи с независимыми правами (сейчас: quality_control →
 * 'planned' | 'history' | 'templates'). Уже частично подключена на фронте
 * через /api/auth/me (feature_access), но раньше не проверялась ни в одном
 * route handler.
 */

export type FeatureAction = 'can_view' | 'can_create' | 'can_edit' | 'can_delete'

export async function hasFeaturePrivilege(
  session: SessionPayload | null,
  moduleCode: string,
  featureCode: string,
  action: FeatureAction,
): Promise<boolean> {
  if (!session || session.roles.length === 0) return false

  const sb = createServerClient()
  const { data } = await sb
    .from('feature_privileges')
    .select(action)
    .eq('module_code', moduleCode)
    .eq('feature_code', featureCode)
    .in('role_code', session.roles)

  return (data ?? []).some(row => (row as Record<FeatureAction, boolean>)[action])
}

/** Throws 401/403 — использовать в route handlers вместо голого getSession(). */
export async function requireFeaturePrivilege(
  moduleCode: string,
  featureCode: string,
  action: FeatureAction,
): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw Object.assign(new Error('Не авторизован'), { status: 401 })
  }
  const ok = await hasFeaturePrivilege(session, moduleCode, featureCode, action)
  if (!ok) {
    throw Object.assign(new Error('Недостаточно прав'), { status: 403 })
  }
  return session
}
