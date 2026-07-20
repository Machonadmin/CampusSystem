import { createServerClient } from '@/lib/supabase/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { RoleCode } from '@/types/database'
import { loadPersonModuleGrants } from '@/lib/permissions/person-grants'

// ─── Гейт доступа к модулю «Бирур яхадут» (Jewishness verification) ───────────
//
// Модуль — фундамент многоэтапного приёма; на этом шаге это плейсхолдер, поэтому
// гейтится ОДНОЙ привилегией 'access' (та же модель, что middleware и
// /api/auth/me): superadmin проходит в обход, любой другой роли нужна строка
// role_privileges(module='jewishness', privilege_code='access'). Более тонкие
// view/create/edit заведены в каталоге module_privileges на будущее, но пока НЕ
// проверяются. Реальные записи проверки + загрузка документов — следующий шаг.

/** true, если у сессии есть доступ к модулю (superadmin — всегда). */
export async function hasJewishnessAccess(session: SessionPayload | null): Promise<boolean> {
  if (!session) return false
  // superadmin (штатный, не студенческий principal) — всегда.
  if (session.principal !== 'student' && session.roles.includes('superadmin')) return true

  // Роль даёт доступ?
  let roleHasAccess = false
  if (session.roles.length > 0) {
    const sb = createServerClient()
    const { data: roleRows, error: rolesErr } = await sb
      .from('roles')
      .select('id')
      .in('code', session.roles as RoleCode[])
    if (!rolesErr && roleRows && roleRows.length > 0) {
      const roleIds = roleRows.map(r => r.id)
      const { data: privs, error: privsErr } = await sb
        .from('role_privileges')
        .select('privilege_code')
        .eq('module', 'jewishness')
        .eq('privilege_code', 'access')
        .in('role_id', roleIds)
        .limit(1)
      if (!privsErr && privs) roleHasAccess = privs.length > 0
    }
  }

  // Персональный оверрайд (grant/deny) — как в остальных модулях: явная строка
  // person_privileges(module='jewishness', 'access') перекрывает роль.
  const accessGrant = (await loadPersonModuleGrants('jewishness', session.person_id))
    .find(g => g.code === 'access')
  if (accessGrant) return accessGrant.is_granted

  return roleHasAccess
}

/**
 * Throws 401 если не залогинен, 403 если нет доступа. Возвращает session при
 * успехе — для использования в маршрутах API.
 *
 * Пример:
 *   await requireJewishnessAccess()
 */
export async function requireJewishnessAccess(): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) {
    throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  }
  const ok = await hasJewishnessAccess(session)
  if (!ok) {
    throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
  }
  return session
}
