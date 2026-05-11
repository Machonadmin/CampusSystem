import { createServerClient } from '@/lib/supabase/server'

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
      message: 'Назначить задачу можно только на пользователя с активным аккаунтом',
    }
  }
  // CHECK constraint
  if (error.code === '23514') {
    if (error.message?.includes('tasks_assignee_consistency'))
      return { status: 400, message: 'Для типа "person" нужен исполнитель, для "department" — отдел' }
    if (error.message?.includes('tasks_unassigned_only_for_pool'))
      return { status: 400, message: 'Статус unassigned возможен только для задач в пуле отдела' }
    if (error.message?.includes('tasks_due_time_consistency'))
      return { status: 400, message: 'Если указано время — флаг "весь день" должен быть выключен (и наоборот)' }
    if (error.message?.includes('tasks_due_time_requires_date'))
      return { status: 400, message: 'Время дедлайна указано без даты' }
    return { status: 400, message: 'Нарушено ограничение БД (CHECK)' }
  }
  // Unique violation
  if (error.code === '23505') return { status: 409, message: 'Дублирующая запись' }
  // Foreign key violation
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }

  return { status: 500, message: error.message ?? 'Ошибка базы данных' }
}
