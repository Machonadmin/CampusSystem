import type { SupabaseClient } from '@supabase/supabase-js'
import type { PrivilegeTarget } from '@/lib/education/permissions'

/**
 * Цель проверки прав для одной journey: её primary_department_id.
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
    .select('primary_department_id')
    .eq('id', journeyId)
    .maybeSingle()
  const dept = (data as { primary_department_id?: string | null } | null)?.primary_department_id ?? null
  return dept ? { department_id: dept } : undefined
}
