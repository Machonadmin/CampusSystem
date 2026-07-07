import { createServerClient } from '@/lib/supabase/server'

// ─── Пакетные выборки для списка студентов психолога (без N+1) ────────────────
//
// Читают ПОСТРАНИЧНО (устойчиво к db-max-rows PostgREST, который молча обрезает
// большие ответы). Тот же приём, что lib/doctor/visits-server.ts.

type SB = ReturnType<typeof createServerClient>
const PAGE = 1000

/** Сегодняшняя дата в ISO 'YYYY-MM-DD'. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Кол-во ОТКРЫТЫХ консультаций по каждому студенту (journey_id). Постранично.
 * Возвращает Map journey_id → число (только для тех, у кого есть открытые).
 */
export async function openSessionCountsByJourney(
  sb: SB, journeyIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (journeyIds.length === 0) return map
  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('psych_sessions')
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
 * Уровень риска по каждому студенту (journey_id) из карты сопровождения.
 * Постранично. В Map попадают ТОЛЬКО студенты с повышенным риском
 * (risk_level !== 'none') — используется для бейджа риска в списке; студенты без
 * карты или с 'none' в Map не попадают (в UI бейдж не показывается).
 */
export async function riskLevelByJourney(
  sb: SB, journeyIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (journeyIds.length === 0) return map
  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('psych_profiles')
      .select('journey_id, risk_level')
      .in('journey_id', journeyIds)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) {
      if (typeof r.risk_level === 'string' && r.risk_level !== 'none') {
        map.set(r.journey_id, r.risk_level)
      }
    }
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return map
}
