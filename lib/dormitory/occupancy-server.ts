import { createServerClient } from '@/lib/supabase/server'
import { rangesOverlap, type Assignment } from './occupancy'

// ─── Пакетные выборки для расчёта занятости (без N+1) ────────────────────────
//
// Обе функции читают ПОСТРАНИЧНО (устойчиво к db-max-rows PostgREST, который
// молча обрезает большие ответы). Дата-фильтр («активно на сегодня») НЕ здесь —
// его применяет вызывающий через occupancy()/isActiveOn(), чтобы вся дата-логика
// жила в одном чистом, покрытом тестами месте.

type SB = ReturnType<typeof createServerClient>
const PAGE = 1000

/** Комнаты набора зданий: id, building_id, capacity. Постранично. */
export async function roomsOfBuildings(
  sb: SB, buildingIds: string[],
): Promise<{ id: string; building_id: string; capacity: number }[]> {
  const out: { id: string; building_id: string; capacity: number }[] = []
  if (buildingIds.length === 0) return out
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('dorm_rooms')
      .select('id, building_id, capacity')
      .in('building_id', buildingIds)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) break
    from += PAGE
  }
  return out
}

/**
 * Активные назначения (status='active') для набора комнат, сгруппированные по
 * room_id. Постранично. Дата-фильтрация — на стороне вызывающего.
 */
export async function activeAssignmentsByRoom(
  sb: SB, roomIds: string[],
): Promise<Map<string, Assignment[]>> {
  const map = new Map<string, Assignment[]>()
  if (roomIds.length === 0) return map
  let from = 0
  for (;;) {
    const { data, error } = await sb
      .from('dorm_assignments')
      .select('room_id, assigned_from, assigned_to, status')
      .in('room_id', roomIds)
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) {
      const list = map.get(r.room_id) ?? []
      list.push({ assigned_from: r.assigned_from, assigned_to: r.assigned_to, status: r.status })
      map.set(r.room_id, list)
    }
    if (rows.length < PAGE) break
    from += PAGE
  }
  return map
}

/** Сегодняшняя дата в ISO 'YYYY-MM-DD'. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Кол-во АКТИВНЫХ назначений в комнате, пересекающихся по датам с [from,to].
 * Можно исключить назначение по id (при правке самого себя). Постранично.
 */
export async function countRoomActiveOverlaps(
  sb: SB, roomId: string, from: string, to: string | null, excludeId?: string,
): Promise<number> {
  let count = 0, offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('dorm_assignments')
      .select('id, assigned_from, assigned_to')
      .eq('room_id', roomId)
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) {
      if (excludeId && r.id === excludeId) continue
      if (rangesOverlap(from, to, r.assigned_from, r.assigned_to)) count++
    }
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return count
}

/**
 * Есть ли у студента (journey) АКТИВНОЕ назначение, пересекающееся по датам с
 * [from,to] в ЛЮБОЙ комнате (двойное бронирование). Можно исключить id.
 */
export async function journeyHasActiveOverlap(
  sb: SB, journeyId: string, from: string, to: string | null, excludeId?: string,
): Promise<boolean> {
  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('dorm_assignments')
      .select('id, assigned_from, assigned_to')
      .eq('journey_id', journeyId)
      .eq('status', 'active')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) {
      if (excludeId && r.id === excludeId) continue
      if (rangesOverlap(from, to, r.assigned_from, r.assigned_to)) return true
    }
    if (rows.length < PAGE) break
    offset += PAGE
  }
  return false
}
