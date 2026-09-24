import type { createServerClient } from '@/lib/supabase/server'
import { extractStudentTag, studentDisplayName, type StudentTag, type TaskStudentRef } from './student-tag'

type Sb = ReturnType<typeof createServerClient>

/**
 * Серверная проверка метки «תלמידה קשורה»: journey существует и принадлежит
 * именно этому человеку. Клиенту не верим — иначе к задаче можно было бы
 * приклеить чужую пару id.
 *
 * Ошибка БД пробрасывается (вызывающий роут маппит её как обычно).
 */
export async function verifyStudentTag(sb: Sb, tag: StudentTag): Promise<boolean> {
  const { data, error } = await sb
    .from('education_journeys')
    .select('id, person_id')
    .eq('id', tag.journey_id)
    .maybeSingle()
  if (error) throw error
  const row = data as { id: string; person_id: string | null } | null
  return !!row && (row.person_id ?? '').toLowerCase() === tag.student_person_id
}

/**
 * Добавляет к строкам задач поле `student` ({ person_id, journey_id, name }) —
 * для чипа с именем תלמידה в списке и на главной. Один запрос к persons на всю
 * пачку. Строки без метки получают student: null.
 *
 * Сбой чтения имён не ломает список задач: чип просто не покажется.
 */
export async function attachStudentRefs<T extends { metadata?: unknown }>(
  sb: Sb,
  rows: T[],
): Promise<Array<T & { student: TaskStudentRef | null }>> {
  const tags = rows.map(r => extractStudentTag(r.metadata))
  const ids = [...new Set(tags.filter((t): t is StudentTag => !!t).map(t => t.student_person_id))]
  const names = new Map<string, string>()
  // Пачками по 200 id: длинный .in() упирается в длину URL запроса PostgREST.
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', ids.slice(i, i + 200))
    if (error) { console.error('[tasks] student names:', error); continue }
    for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
      names.set(p.id.toLowerCase(), studentDisplayName(p))
    }
  }
  return rows.map((r, i) => {
    const tag = tags[i]
    return {
      ...r,
      student: tag
        ? { person_id: tag.student_person_id, journey_id: tag.journey_id, name: names.get(tag.student_person_id) ?? '' }
        : null,
    }
  })
}
