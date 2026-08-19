import { createServerClient } from '@/lib/supabase/server'
import { isExpired, isExpiringSoon } from './expiry'

// ─── Пакетные выборки для списка студентов модуля «Документы» (без N+1) ───────
//
// Читают ПОСТРАНИЧНО (устойчиво к db-max-rows PostgREST, который молча обрезает
// большие ответы). Тот же приём, что lib/doctor/visits-server.ts.

type SB = ReturnType<typeof createServerClient>
const PAGE = 1000

/** Сегодняшняя дата в ISO 'YYYY-MM-DD'. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Сводка по документам одного студента для списка. */
export interface JourneyDocSummary {
  count: number
  has_expired: boolean
  has_expiring_soon: boolean
}

/**
 * По каждому journey_id: общее число документов и флаги «есть просроченный» /
 * «есть истекающий скоро» (только по активным документам — см. чистые хелперы
 * isExpired/isExpiringSoon). Постранично. В карте только journey с документами.
 */
export async function documentSummariesByJourney(
  sb: SB, journeyIds: string[], todayISODate: string,
): Promise<Map<string, JourneyDocSummary>> {
  const map = new Map<string, JourneyDocSummary>()
  if (journeyIds.length === 0) return map
  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('document_records')
      .select('journey_id, expiry_date, status')
      .in('journey_id', journeyIds)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as { journey_id: string; expiry_date: string | null; status: string }[]
    for (const r of rows) {
      const cur = map.get(r.journey_id) ?? { count: 0, has_expired: false, has_expiring_soon: false }
      cur.count++
      if (isExpired(r, todayISODate)) cur.has_expired = true
      if (isExpiringSoon(r, todayISODate)) cur.has_expiring_soon = true
      map.set(r.journey_id, cur)
    }
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return map
}
