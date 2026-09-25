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
 * Цель проверки прав для СУЩЕСТВУЮЩЕЙ journey (чистая функция).
 *   • есть подразделение → { department_id }
 *   • лид без подразделения → {} — общий пул набора (решение владельца
 *     2026-09-25: лиды не фильтруются по מחלקה, их видят все сотрудники набора)
 *   • абитуриентка/студентка без подразделения → { unassigned: true } —
 *     department-ограниченный сотрудник доступа не получает, только scope='all'.
 */
export function journeyTarget(row: {
  education_status?: string | null
  primary_department_id?: string | null
  desired_department_id?: string | null
}): PrivilegeTarget {
  const dept = journeyScopeDepartment(row)
  if (dept) return { department_id: dept }
  if (row.education_status === 'lead') return {}
  return { unassigned: true }
}

/**
 * Цель проверки прав для одной journey: её подразделение (journeyScopeDepartment).
 *
 * Для scope='all' target ничего не меняет (доступ всегда), для scope='department'
 * ограничивает доступ подразделением journey. Без подразделения — см. journeyTarget
 * (лид — общий пул, остальные — только scope='all'). Используется, чтобы single-journey эндпоинты не давали
 * department-ограниченному пользователю доступ к чужим подразделениям.
 */
export async function journeyDeptTarget(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: SupabaseClient<any, any, any>,
  journeyId: string,
): Promise<PrivilegeTarget> {
  const { data } = await sb
    .from('education_journeys')
    .select('education_status, primary_department_id, desired_department_id')
    .eq('id', journeyId)
    .maybeSingle()
  // Нет такой journey → «unassigned»: department-scope не проходит (раньше —
  // undefined, т.е. пропуск для любого department-сотрудника).
  if (!data) return { unassigned: true }
  return journeyTarget(data as Parameters<typeof journeyTarget>[0])
}
