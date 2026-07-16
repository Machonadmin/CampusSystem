import { createServerClient } from '@/lib/supabase/server'
import type { SessionPayload } from '@/lib/auth/jwt'

/**
 * Доступ руководителя учебной единицы (department). Руководитель = активный
 * глава (staff_positions.is_head) единицы. Он управляет своими секретарями/
 * учителями и их персональными правами.
 */

/** Активные единицы, где человек — глава (is_head, позиция не закрыта). */
export async function getHeadedUnitIds(personId: string): Promise<string[]> {
  const sb = createServerClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await sb
    .from('staff_positions')
    .select('department_id, is_head, end_date')
    .eq('person_id', personId)
    .eq('is_head', true)
  const ids = new Set<string>()
  for (const r of (data ?? []) as Array<{ department_id: string | null; end_date: string | null }>) {
    if (r.department_id && (r.end_date === null || r.end_date > today)) ids.add(r.department_id)
  }
  return [...ids]
}

/**
 * Делегирование (§4 «право выдавать права»): активный член единицы, которому
 * глава лично выдал право `delegate_privileges`, тоже получает доступ к панели
 * состава единицы (может выдавать права подчинённым — но не больше, чем держит
 * сам; см. cap в privileges-роуте).
 */
export async function hasDelegatedTeamAccess(personId: string, unitId: string): Promise<boolean> {
  const sb = createServerClient()
  const today = new Date().toISOString().slice(0, 10)
  const { data: pos } = await sb.from('staff_positions')
    .select('end_date').eq('person_id', personId).eq('department_id', unitId)
  const active = (pos ?? []).some(p => {
    const ed = (p as { end_date: string | null }).end_date
    return ed === null || ed > today
  })
  if (!active) return false
  const now = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pg } = await (sb as any).from('person_privileges')
    .select('is_granted, expires_at').eq('person_id', personId)
    .eq('module', 'education').eq('privilege_code', 'delegate_privileges')
  return ((pg ?? []) as Array<{ is_granted: boolean; expires_at: string | null }>)
    .some(g => g.is_granted && (!g.expires_at || g.expires_at > now))
}

/** Может ли пользователь управлять составом единицы: superadmin, её глава, или делегат. */
export async function canManageUnit(session: SessionPayload, unitId: string): Promise<boolean> {
  if (session.roles.includes('superadmin')) return true
  const heads = await getHeadedUnitIds(session.person_id)
  if (heads.includes(unitId)) return true
  return hasDelegatedTeamAccess(session.person_id, unitId)
}

/**
 * Каталог education-привилегий, которые руководитель может выдать лично
 * секретарю/учителю (через person_privileges). Порядок = порядок в UI.
 */
export const GRANTABLE_EDUCATION_PRIVILEGES = [
  'view_students',
  'manage_students',
  'manage_enrollments',
  'manage_class_groups',
  'manage_class_teachers',
  'set_lesson_topics',
  'mark_attendance',
  'set_grades',
  'manage_study_groups',
  'manage_subjects',
  'manage_specialties',
  'write_evaluation',
  // Мета-право (§4): «право выдавать права» — даёт доступ к панели состава
  // единицы. Хранится только в person_privileges; проверяется в
  // hasDelegatedTeamAccess. Выдать может лишь глава/superadmin (не делегат).
  'delegate_privileges',
] as const

export type GrantablePrivilege = (typeof GRANTABLE_EDUCATION_PRIVILEGES)[number]

export function isGrantablePrivilege(code: string): code is GrantablePrivilege {
  return (GRANTABLE_EDUCATION_PRIVILEGES as readonly string[]).includes(code)
}
