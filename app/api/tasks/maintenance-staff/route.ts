import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/api/handler'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { maintenanceStaffPersonIds } from '@/lib/maintenance/staff-server'

/**
 * GET /api/tasks/maintenance-staff — person_id тех, у кого в настройках стоит
 * роль техслужбы. Нужен форме создания задачи: только выбрав такого
 * исполнителя, автор видит галочку «это задача по эксплуатации».
 *
 * Живёт в /api/tasks, а НЕ в /api/maintenance, намеренно: это обслуживание
 * формы задачи, и задачу создаёт любой сотрудник — в том числе тот, у кого нет
 * доступа к модулю «Эксплуатация» (директор ставит задачу технику). Требуй мы
 * здесь maintenance.view, галочка не появилась бы именно у тех, кому она нужна.
 *
 * Отдаём ТОЛЬКО идентификаторы, без имён: список нужен для сравнения с уже
 * выбранным человеком, а имена сотрудников форма и так показывает в своём
 * выборе. Доступ — любой сотрудник, но не студенческий портальный токен.
 */
export async function GET() {
  try {
    await requireStaff()
    const sb = createServerClient()
    // null — состав техслужбы прочитать не удалось. Отдаём пустой список
    // (fail-closed): галочка просто не появится, форма задачи работает как
    // раньше. Ошибку в ответ не превращаем — создание задачи важнее галочки.
    const ids = await maintenanceStaffPersonIds(sb)
    return NextResponse.json({ person_ids: ids ? [...ids] : [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
