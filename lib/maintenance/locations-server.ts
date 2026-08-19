import { createServerClient } from '@/lib/supabase/server'

// ─── Резолв имён локаций (здание/комната общежития) — пакетно, без N+1 ────────
//
// Модуль «Эксплуатация» НЕ coupled с правами модуля «Общежитие»: имена здания и
// комнаты для заявок читаются здесь напрямую из dorm_buildings/dorm_rooms под
// правом самого maintenance. Id-списки режутся на чанки ≤ CHUNK: каждый .in()
// матчит ≤ CHUNK строк (id уникален), поэтому ответ не упирается в db-max-rows
// PostgREST, который молча обрезает большие выборки.

type SB = ReturnType<typeof createServerClient>
const PAGE = 1000                       // размер страницы чтения комнат (dorm_rooms)
const CHUNK = 500                        // размер чанка id для .in()-резолва имён

/** name по building_id. Пустой вход → пустая Map. Id режутся на чанки. */
export async function buildingNamesByIds(sb: SB, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await sb
      .from('dorm_buildings')
      .select('id, name')
      .in('id', unique.slice(i, i + CHUNK))
    if (error) throw error
    for (const b of data ?? []) map.set(b.id, b.name)
  }
  return map
}

/** room_number по room_id. Пустой вход → пустая Map. Id режутся на чанки. */
export async function roomNumbersByIds(sb: SB, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await sb
      .from('dorm_rooms')
      .select('id, room_number')
      .in('id', unique.slice(i, i + CHUNK))
    if (error) throw error
    for (const r of data ?? []) map.set(r.id, r.room_number)
  }
  return map
}

export interface LocationBuilding {
  id: string
  name: string
  code: string | null
  rooms: { id: string; room_number: string; floor: number | null }[]
}

/**
 * Дерево локаций «здание → комнаты» для пикера в форме заявки. Постранично.
 * Комнаты группируются по building_id; здания и комнаты сортируются по имени /
 * номеру. Право проверяется в эндпоинте (maintenance.view).
 */
export async function locationTree(sb: SB): Promise<LocationBuilding[]> {
  const { data: buildings, error: bErr } = await sb
    .from('dorm_buildings')
    .select('id, name, code')
    .order('name', { ascending: true })
  if (bErr) throw bErr

  const byId = new Map<string, LocationBuilding>()
  const result: LocationBuilding[] = []
  for (const b of buildings ?? []) {
    const entry: LocationBuilding = { id: b.id, name: b.name, code: b.code, rooms: [] }
    byId.set(b.id, entry)
    result.push(entry)
  }

  let offset = 0
  for (;;) {
    const { data, error } = await sb
      .from('dorm_rooms')
      .select('id, building_id, room_number, floor')
      .order('room_number', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const r of rows) {
      const b = byId.get(r.building_id)
      if (b) b.rooms.push({ id: r.id, room_number: r.room_number, floor: r.floor })
    }
    if (rows.length < PAGE) break
    offset += PAGE
  }

  return result
}
