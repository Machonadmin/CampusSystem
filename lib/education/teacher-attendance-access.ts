import type { SessionPayload } from '@/lib/auth/jwt'
import type { createServerClient } from '@/lib/supabase/server'
import { hasEducationPrivilege, getEducationPrivilegeScope } from '@/lib/education/permissions'

/**
 * Может ли сессия подтверждать/отклонять нокхут морим по уроку lessonId.
 * Подтверждать может ТОЛЬКО менеджер подразделения этого урока (решение
 * владельца: «רק המחלקה שלו»). Урок → группа → department_id. Если у группы нет
 * подразделения — действовать может лишь scope='all' (иначе department-scope
 * трактовался бы как «общий пул»). superadmin — всегда.
 */
export async function canDecideTeacherAttendance(
  session: SessionPayload,
  sb: ReturnType<typeof createServerClient>,
  lessonId: string,
): Promise<boolean> {
  if (session.roles.includes('superadmin')) return true
  const { data: lesson } = await sb.from('lessons').select('class_group_id').eq('id', lessonId).maybeSingle()
  let deptId: string | null = null
  const cgId = (lesson as { class_group_id?: string } | null)?.class_group_id
  if (cgId) {
    const { data: cg } = await sb.from('class_groups').select('department_id').eq('id', cgId).maybeSingle()
    deptId = (cg as { department_id?: string | null } | null)?.department_id ?? null
  }
  return deptId
    ? hasEducationPrivilege(session, 'manage_students', { department_id: deptId })
    : (await getEducationPrivilegeScope(session, 'manage_students')) === 'all'
}
