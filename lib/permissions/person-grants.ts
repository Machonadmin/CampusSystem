import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

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
    const sb = createServerClient() as unknown as SupabaseClient
    const { data, error } = await sb
      .from('person_privileges')
      .select('privilege_code, is_granted, expires_at')
      .eq('person_id', personId)
      .eq('module', module)
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
