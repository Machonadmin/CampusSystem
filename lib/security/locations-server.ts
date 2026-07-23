import { createServerClient } from '@/lib/supabase/server'

// ─── Резолв имён зданий общежития для инцидентов — пакетно, без N+1 ───────────
//
// Модуль «Безопасность» НЕ coupled с правами модуля «Общежитие»: имя здания для
// инцидента (место происшествия) читается здесь напрямую из dorm_buildings под
// правом самого security. Id-списки режутся на чанки ≤ CHUNK: каждый .in()
// матчит ≤ CHUNK строк (id уникален), поэтому ответ не упирается в db-max-rows
// PostgREST, который молча обрезает большие выборки. Зеркалит подход
// lib/maintenance/locations-server.ts (у инцидента нет room_id — только здание).

type SB = ReturnType<typeof createServerClient>
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

export interface BuildingOption {
  id: string
  name: string
  code: string | null
}

/**
 * Список зданий общежития для пикера места происшествия в форме инцидента.
 * Сортируется по имени. Право проверяется в эндпоинте (security.view).
 */
export async function buildingsList(sb: SB): Promise<BuildingOption[]> {
  const { data, error } = await sb
    .from('dorm_buildings')
    .select('id, name, code')
    .order('name', { ascending: true })
  if (error) throw error
  return (data ?? []).map(b => ({ id: b.id, name: b.name, code: b.code }))
}
