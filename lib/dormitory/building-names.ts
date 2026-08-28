import { createServerClient } from '@/lib/supabase/server'

// ─── Резолв имён зданий общежития по id — пакетно, без N+1 ────────────────────
//
// Единая каноническая копия. Модули «Эксплуатация» и «Безопасность» читают имена
// зданий (dorm_buildings) для своих заявок/инцидентов и раньше держали побайтово
// одинаковую копию этой функции у себя; теперь она здесь, а модули её
// реэкспортируют. Id-списки режутся на чанки ≤ CHUNK: каждый .in() матчит ≤ CHUNK
// строк (id уникален), поэтому ответ не упирается в db-max-rows PostgREST,
// который молча обрезает большие выборки.

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
