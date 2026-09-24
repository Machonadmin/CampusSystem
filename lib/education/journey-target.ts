import type { SupabaseClient } from '@supabase/supabase-js'
import type { PrivilegeTarget } from '@/lib/education/permissions'
import { isStudentStatus } from '@/lib/education/journey-status'

/**
 * Подразделение, по которому проверяются права на journey. Для студентки
 * (учебный цикл) — primary_department_id; для лида/абитуриентки —
 * desired_department_id (у них primary обычно ещё пуст), с запасом на primary.
 * Так же выбирает список /api/education/journeys и карточка journeys/[id]:
 * раньше single-journey проверки всегда брали primary, у лида он пуст, и
 * department-ограниченный сотрудник любого подразделения проходил к документам,
 * сообщениям и т.п. ЛЮБОЙ абитуриентки.
 */
export function journeyScopeDepartment(row: {
  education_status?: string | null
  primary_department_id?: string | null
  desired_department_id?: string | null
}): string | null {
  if (isStudentStatus(row.education_status)) return row.primary_department_id ?? null
  return row.desired_department_id ?? row.primary_department_id ?? null
}

/**
 * Цель проверки прав для одной journey: её подразделение (journeyScopeDepartment).
 *
 * Для scope='all' target ничего не меняет (доступ всегда), для scope='department'
 * ограничивает доступ подразделением journey. Возвращает undefined, если у
 * journey нет подразделения (тогда department-scope трактуется как общий пул —
 * прежнее поведение). Используется, чтобы single-journey эндпоинты не давали
 * department-ограниченному пользователю доступ к чужим подразделениям.
 */
export async function journeyDeptTarget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  journeyId: string,
): Promise<PrivilegeTarget | undefined> {
  const { data } = await sb
    .from('education_journeys')
    .select('education_status, primary_department_id, desired_department_id')
    .eq('id', journeyId)
    .maybeSingle()
  const dept = data ? journeyScopeDepartment(data as Parameters<typeof journeyScopeDepartment>[0]) : null
  return dept ? { department_id: dept } : undefined
}
