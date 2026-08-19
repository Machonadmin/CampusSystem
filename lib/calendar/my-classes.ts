import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// ─── Мои учебные группы для календаря (преподаватель ∪ студент) ───────────────
//
// Единый источник class_group_id для роутов уроков и расписания. Возвращает
// ОБЪЕДИНЕНИЕ групп, где текущий пользователь:
//   • преподаватель  — class_teachers.teacher_id = я;
//   • студент        — записан через journey (class_enrollments.journey_id ∈
//     мои journeys, где education_journeys.person_id = я).
// Всё self-scoped и ПОСТРАНИЧНО (PostgREST режет >1000 строк). .in() запускаем
// только на непустых наборах. Набор дедуплицируется (Set).

type SB = SupabaseClient<Database>

// Постраничный размер выборки.
const PAGE = 1000
// Размер чанка для .in() по journey_id (у студента их обычно единицы, но
// объединяем безопасно на случай большого числа journeys).
const IN_CHUNK = 200

export async function resolveMyClassGroupIds(sb: SB, personId: string): Promise<string[]> {
  const groupIds = new Set<string>()

  // 1) Группы, где я преподаватель (постранично).
  {
    let offset = 0
    for (;;) {
      const { data, error } = await sb
        .from('class_teachers')
        .select('class_group_id')
        .eq('teacher_id', personId)
        .order('class_group_id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const page = data ?? []
      for (const r of page) groupIds.add(r.class_group_id)
      if (page.length < PAGE) break
      offset += PAGE
    }
  }

  // 2) Мои journeys (education_journeys.person_id = я), постранично.
  const journeyIds: string[] = []
  {
    let offset = 0
    for (;;) {
      const { data, error } = await sb
        .from('education_journeys')
        .select('id')
        .eq('person_id', personId)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const page = data ?? []
      for (const r of page) journeyIds.push(r.id)
      if (page.length < PAGE) break
      offset += PAGE
    }
  }

  // 3) Группы, где я записан студентом. .in() ТОЛЬКО при непустом наборе
  //    journeys; чанкуем journeyIds и каждую страницу читаем постранично.
  if (journeyIds.length > 0) {
    for (let i = 0; i < journeyIds.length; i += IN_CHUNK) {
      const chunk = journeyIds.slice(i, i + IN_CHUNK)
      let offset = 0
      for (;;) {
        const { data, error } = await sb
          .from('class_enrollments')
          .select('class_group_id')
          .in('journey_id', chunk)
          .order('class_group_id', { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (error) throw error
        const page = data ?? []
        for (const r of page) groupIds.add(r.class_group_id)
        if (page.length < PAGE) break
        offset += PAGE
      }
    }
  }

  return Array.from(groupIds)
}
