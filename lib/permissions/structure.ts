import { createServerClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/dates'
import { NO_SEATS, seatsFromRows, type SeatRow, type StructureSeats } from './structure-rules'

// Права «Учёбы» из оргструктуры: правила — в ./structure-rules (чистые, их
// читает и Edge-middleware), здесь только загрузка посадок из БД.
export * from './structure-rules'

/**
 * Посадки человека из БД. Устойчиво к деплою до миграции is_deputy: если
 * колонки ещё нет, читаем без неё (заместителей просто нет). Ошибка чтения →
 * NO_SEATS (запрет, а не расширение).
 */
export async function loadStructureSeats(personId: string): Promise<StructureSeats> {
  const sb = createServerClient()
  const today = todayISO()
  const withDeputy = await sb
    .from('staff_positions')
    .select('department_id, is_head, is_deputy, end_date')
    .eq('person_id', personId)
  if (!withDeputy.error && withDeputy.data) {
    return seatsFromRows(withDeputy.data as unknown as SeatRow[], today)
  }
  const plain = await sb
    .from('staff_positions')
    .select('department_id, is_head, end_date')
    .eq('person_id', personId)
  if (plain.error || !plain.data) return NO_SEATS
  return seatsFromRows(plain.data as SeatRow[], today)
}
