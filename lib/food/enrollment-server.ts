import { createServerClient } from '@/lib/supabase/server'
import { isActiveOn, rangesOverlap, type Enrollment } from './enrollment'

// ─── Пакетные выборки для расчёта записей (без N+1) ──────────────────────────
//
// Читают ПОСТРАНИЧНО (устойчиво к db-max-rows PostgREST, который молча обрезает
// большие ответы). Дата-логика («активно на сегодня» / пересечение) — через
// чистые, покрытые тестами хелперы из ./enrollment.

type SB = ReturnType<typeof createServerClient>
const PAGE = 1000

/** Сегодняшняя дата в ISO 'YYYY-MM-DD'. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Кол-во АКТИВНЫХ на сегодня записей по каждому плану питания. Постранично.
 * Возвращает Map plan_id → число.
 */
export async function activeCountByPlan(
  sb: SB, planIds: string[], dateISO: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (planIds.length === 0) return map
  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('meal_enrollments')
      .select('meal_plan_id, enrolled_from, enrolled_to, status')
      .in('meal_plan_id', planIds)
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) {
      const active = isActiveOn(
        { enrolled_from: r.enrolled_from, enrolled_to: r.enrolled_to, status: r.status } as Enrollment,
        dateISO,
      )
      if (active) map.set(r.meal_plan_id, (map.get(r.meal_plan_id) ?? 0) + 1)
    }
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return map
}

/**
 * Есть ли у студента (journey) АКТИВНАЯ запись на план питания, пересекающаяся
 * по датам с [from,to] (на ЛЮБОМ плане — правило «одна активная запись»).
 * Можно исключить запись по id (при правке самой себя). Постранично.
 */
export async function journeyHasActiveOverlap(
  sb: SB, journeyId: string, from: string, to: string | null, excludeId?: string,
): Promise<boolean> {
  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('meal_enrollments')
      .select('id, enrolled_from, enrolled_to')
      .eq('journey_id', journeyId)
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) {
      if (excludeId && r.id === excludeId) continue
      if (rangesOverlap(from, to, r.enrolled_from, r.enrolled_to)) return true
    }
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return false
}
