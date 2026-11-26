import { createServerClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/dates'
import { personalGrantScopeFor } from './scope'
import type { PrivilegeModule } from '@/types/database'

/**
 * Персональные привилегии (`person_privileges`) для конкретного модуля и
 * человека: точечные grant/deny поверх ролевых прав. Раньше применялись ТОЛЬКО
 * в education; этот общий загрузчик делает их платформенными (решение владельца).
 *
 * Возвращает список { code, is_granted } (deny=false «побеждает» роль в
 * applyPersonGrants). Просроченные (`expires_at`) отбрасываются. Деплой-безопасно:
 * нет таблицы/ошибка → пусто (поведение как раньше, без person-оверрайдов).
 */
export async function loadPersonModuleGrants(
  module: string,
  personId: string,
): Promise<{ code: string; is_granted: boolean }[]> {
  try {
    // Untyped-клиент: module — произвольная строка модуля, а типизированная
    // колонка ждёт union; деплой-безопасно (нет таблицы → catch → []).
    const sb = createServerClient()
    const { data, error } = await sb
      .from('person_privileges')
      .select('privilege_code, is_granted, expires_at')
      .eq('person_id', personId)
      .eq('module', module as PrivilegeModule)
    if (error || !data) return []
    const now = Date.now()
    return data
      .filter(r => {
        const exp = (r as { expires_at: string | null }).expires_at
        return !exp || new Date(exp).getTime() > now
      })
      .map(r => ({
        code: (r as { privilege_code: string }).privilege_code,
        is_granted: (r as { is_granted: boolean }).is_granted,
      }))
  } catch {
    return []
  }
}

/**
 * Область личных выдач человека: 'all', если у него действующая посадка в
 * верхней единице оргструктуры (parent_id = null), иначе 'department'.
 * Правило — personalGrantScopeFor в ./scope. Ошибка чтения → 'department'
 * (прежнее поведение, не шире).
 */
export async function loadPersonalGrantScope(personId: string): Promise<'department' | 'all'> {
  try {
    const sb = createServerClient()
    const today = todayISO()
    const [{ data: seats, error: seatErr }, { data: tops, error: topErr }] = await Promise.all([
      sb.from('staff_positions').select('department_id, end_date').eq('person_id', personId),
      sb.from('departments').select('id').is('parent_id', null),
    ])
    if (seatErr || topErr || !seats || !tops) return 'department'
    const active = (seats as { department_id: string | null; end_date: string | null }[])
      .filter(r => r.department_id && (r.end_date === null || r.end_date > today))
      .map(r => r.department_id as string)
    return personalGrantScopeFor(active, (tops as { id: string }[]).map(r => r.id))
  } catch {
    return 'department'
  }
}
