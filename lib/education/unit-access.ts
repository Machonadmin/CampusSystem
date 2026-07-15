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

/** Может ли пользователь управлять составом единицы: superadmin или её глава. */
export async function canManageUnit(session: SessionPayload, unitId: string): Promise<boolean> {
  if (session.roles.includes('superadmin')) return true
  const heads = await getHeadedUnitIds(session.person_id)
  return heads.includes(unitId)
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
] as const

export type GrantablePrivilege = (typeof GRANTABLE_EDUCATION_PRIVILEGES)[number]

export function isGrantablePrivilege(code: string): code is GrantablePrivilege {
  return (GRANTABLE_EDUCATION_PRIVILEGES as readonly string[]).includes(code)
}
