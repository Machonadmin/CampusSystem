import { createServerClient } from '@/lib/supabase/server'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { RoleCode } from '@/types/database'

/**
 * Модули, к которым у пользователя есть доступ (privilege_code='access').
 *
 * Та же логика, что в middleware (fetchAccessibleModules) и сайдбаре:
 *   1) ролевые гранты из role_privileges (access);
 *   2) персональные оверрайды person_privileges (grant добавляет, deny убирает,
 *      истёкшие expires_at игнорируются).
 * superadmin здесь НЕ обрабатывается особо — вызывающий код сам решает, нужен
 * ли ему bypass (обычно да: проверяй roles.includes('superadmin') ДО вызова).
 */
export async function getAccessibleModules(session: SessionPayload): Promise<string[]> {
  const sb = createServerClient()
  const set = new Set<string>()

  if (session.roles.length > 0) {
    const { data: roleRows } = await sb.from('roles').select('id').in('code', session.roles as RoleCode[])
    const roleIds = (roleRows ?? []).map(r => r.id)
    if (roleIds.length > 0) {
      const { data: privs } = await sb
        .from('role_privileges')
        .select('module')
        .in('role_id', roleIds)
        .eq('privilege_code', 'access')
      for (const p of privs ?? []) set.add(p.module as string)
    }
  }

  // Персональные оверрайды поверх ролей (deploy-безопасно к отсутствию таблицы).
  try {
    const { data: overrides } = await sb
      .from('person_privileges')
      .select('module, is_granted, expires_at')
      .eq('person_id', session.person_id)
      .eq('privilege_code', 'access')
    const now = Date.now()
    for (const r of overrides ?? []) {
      if (r.expires_at && new Date(r.expires_at as string).getTime() <= now) continue
      if (r.is_granted) set.add(r.module as string)
      else set.delete(r.module as string)
    }
  } catch { /* таблицы нет — остаёмся на ролевом списке */ }

  return [...set]
}
