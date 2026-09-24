import { createServerClient } from '@/lib/supabase/server'
import { serverT } from '@/lib/i18n/api-errors'

/**
 * Возвращает массив department_id, в которых сотрудник.
 * Учитываются только текущие позиции (end_date IS NULL или в будущем).
 */
export async function getPersonDepartments(personId: string): Promise<string[]> {
  const sb = createServerClient()
  const { data, error } = await sb
    .from('staff_positions')
    .select('department_id')
    .eq('person_id', personId)
    .or('end_date.is.null,end_date.gt.now()')

  if (error || !data) return []
  return Array.from(new Set(data.map(r => r.department_id).filter(Boolean) as string[]))
}

/**
 * Преобразует ошибку Supabase/Postgres в { status, message } для HTTP-ответа.
 */
export function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  // Кастомный триггер tasks_validate_account
  if (error.message?.includes('does not have an active person_account')) {
    return {
      status: 400,
      message: serverT('assign_only_active_account'),
    }
  }
  // CHECK constraint
  if (error.code === '23514') {
    if (error.message?.includes('tasks_assignee_consistency'))
      return { status: 400, message: serverT('assignee_needs_person_or_department') }
    if (error.message?.includes('tasks_unassigned_only_for_pool'))
      return { status: 400, message: serverT('unassigned_only_pool') }
    if (error.message?.includes('tasks_due_time_consistency'))
      return { status: 400, message: serverT('time_requires_not_allday') }
    if (error.message?.includes('tasks_due_time_requires_date'))
      return { status: 400, message: serverT('deadline_time_without_date') }
    return { status: 400, message: serverT('db_constraint_check') }
  }
  // Unique violation
  if (error.code === '23505') return { status: 409, message: serverT('duplicate_record') }
  // Foreign key violation
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference') }

  return { status: 500, message: error.message ?? serverT('database_error') }
}
