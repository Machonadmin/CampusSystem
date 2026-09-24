import { createServerClient } from '@/lib/supabase/server'

// ─── Локации зданий общежития для инцидентов — без N+1 ───────────────────────
//
// Модуль «Безопасность» НЕ coupled с правами модуля «Общежитие»: имя здания для
// инцидента (место происшествия) читается напрямую из dorm_buildings под правом
// самого security. Резолв имён по id — единая копия buildingNamesByIds
// (lib/dormitory/building-names.ts), реэкспортируется ниже.

type SB = ReturnType<typeof createServerClient>

/** name по building_id — единая копия в lib/dormitory/building-names.ts. */
export { buildingNamesByIds } from '@/lib/dormitory/building-names'

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
