import { createServerClient } from '@/lib/supabase/server'

// ─── Пакетные выборки для списка студентов медпункта (без N+1) ───────────────
//
// Читают ПОСТРАНИЧНО (устойчиво к db-max-rows PostgREST, который молча обрезает
// большие ответы). Тот же приём, что lib/food/enrollment-server.ts.

type SB = ReturnType<typeof createServerClient>
const PAGE = 1000

/** Сегодняшняя дата в ISO 'YYYY-MM-DD'. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Кол-во ОТКРЫТЫХ приёмов по каждому студенту (journey_id). Постранично.
 * Возвращает Map journey_id → число (только для тех, у кого есть открытые).
 */
export async function openVisitCountsByJourney(
  sb: SB, journeyIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (journeyIds.length === 0) return map
  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('medical_visits')
      .select('journey_id')
      .in('journey_id', journeyIds)
      .eq('status', 'open')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) {
      map.set(r.journey_id, (map.get(r.journey_id) ?? 0) + 1)
    }
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return map
}

/**
 * Множество journey_id, у чьей медкарты заполнено поле allergies (непустое).
 * Постранично. Используется для «флага аллергии» в списке студентов.
 */
export async function allergyJourneyIds(
  sb: SB, journeyIds: string[],
): Promise<Set<string>> {
  const set = new Set<string>()
  if (journeyIds.length === 0) return set
  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('medical_profiles')
      .select('journey_id, allergies')
      .in('journey_id', journeyIds)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) {
      if (typeof r.allergies === 'string' && r.allergies.trim() !== '') {
        set.add(r.journey_id)
      }
    }
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return set
}
