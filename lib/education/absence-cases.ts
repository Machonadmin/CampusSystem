import { createServerClient } from '@/lib/supabase/server'
import { createNotifications } from '@/lib/notifications/create'

// absence_cases ещё нет в сгенерированных типах БД (миграция применяется
// владельцем) — обращаемся к таблице через нетипизированный клиент.

/**
 * Уведомляет сотрудников подразделения о переданном на них случае отсутствия.
 * Возвращает число уведомлённых. Best-effort. Тексты на иврите (как остальные
 * уведомления проекта).
 */
export async function notifyDepartmentAbsence(
  sb: ReturnType<typeof createServerClient>,
  departmentId: string,
  studentName: string,
  note: string | null,
): Promise<number> {
  const { data: staff } = await sb.from('staff_positions').select('person_id').eq('department_id', departmentId).is('end_date', null)
  const recipients = [...new Set((staff ?? []).map(r => (r as { person_id: string }).person_id))]
  if (recipients.length === 0) return 0
  await createNotifications(sb, recipients.map(pid => ({
    person_id: pid,
    type: 'absence_transfer',
    title: 'טיפול בהעדרות הועבר אליכם',
    body: `${studentName}${note ? ' — ' + note : ''}`,
    link: '/dashboard/education/absences',
    metadata: { department_id: departmentId },
  })))
  return recipients.length
}
