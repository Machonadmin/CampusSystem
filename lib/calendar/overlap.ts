import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { rangesOverlap } from './calendar'

// ─── Защита от двойного бронирования (server-side, читает БД) ────────────────
//
// Встреча НЕ должна пересекаться по времени с другой ЗАПЛАНИРОВАННОЙ
// (status='scheduled') встречей того же провайдера. Отменённые / завершённые /
// no_show не блокируют слот. Решение о пересечении принимает чистая
// rangesOverlap (касание границами — НЕ пересечение), см. calendar.ts.
//
// Кандидатов выбираем узким SQL-фильтром (starts_at < ends_at И ends_at >
// starts_at), затем ПОДТВЕРЖДАЕМ каждого через rangesOverlap. Читаем
// постранично — на случай, если у провайдера накопилось >1000 встреч в окне.

const PAGE = 1000

/**
 * Есть ли у провайдера запланированная встреча, пересекающаяся с интервалом
 * [startsAt, endsAt). excludeId — id редактируемой встречи (исключить саму себя).
 */
export async function hasOverlappingAppointment(
  sb: SupabaseClient<Database>,
  providerId: string,
  startsAt: string,
  endsAt: string,
  excludeId?: string,
): Promise<boolean> {
  let from = 0
  for (;;) {
    let q = sb
      .from('appointments')
      .select('id, starts_at, ends_at')
      .eq('provider_id', providerId)
      .eq('status', 'scheduled')
      .lt('starts_at', endsAt)      // кандидат начинается раньше конца нового
      .gt('ends_at', startsAt)      // и заканчивается позже начала нового
      .order('starts_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (excludeId) q = q.neq('id', excludeId)

    const { data, error } = await q
    if (error) throw error
    const rows = data ?? []

    for (const r of rows) {
      if (rangesOverlap(startsAt, endsAt, r.starts_at as string, r.ends_at as string)) {
        return true
      }
    }
    if (rows.length < PAGE) break
    from += PAGE
  }
  return false
}
