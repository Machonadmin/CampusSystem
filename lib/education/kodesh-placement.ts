import { createServerClient } from '@/lib/supabase/server'
import { isMissingColumn } from '@/lib/supabase/errors'

type SB = ReturnType<typeof createServerClient>

/**
 * Уровень кодеша ≠ ростер курса. Уроки, посещаемость и оценки курса видят ТОЛЬКО
 * записанных в курс (lesson-access.ts getEnrolledJourneyIds), поэтому шибуц в
 * уровень обязан записывать студентку и в курсы этого уровня.
 *
 * Синхронизирует записи студентки в КУРСЫ уровней кодеша (class_groups с
 * parent_semester_id ∈ levelIds):
 *   - снимает со всех курсов ДРУГИХ уровней кодеша (и со всех курсов, если
 *     levelId = null — студентку сняли с уровня);
 *   - записывает во все АКТИВНЫЕ курсы уровня levelId (идемпотентно; уже
 *     записанные не трогаются).
 *
 * Деплой-безопасно: нет колонки parent_semester_id (42703) → курсов нет, no-op.
 */
export async function syncKodeshCourseEnrollments(
  sb: SB,
  journeyId: string,
  levelId: string | null,
  levelIds: string[],
): Promise<void> {
  if (levelIds.length === 0) return

  const { data, error } = await sb
    .from('class_groups')
    .select('id, parent_semester_id, is_active')
    .in('parent_semester_id', levelIds)
  if (error) {
    if (isMissingColumn(error)) return
    throw error
  }
  const courses = (data ?? []) as Array<{ id: string; parent_semester_id: string | null; is_active: boolean | null }>

  const otherCourseIds = courses.filter(c => c.parent_semester_id !== levelId).map(c => c.id)
  if (otherCourseIds.length > 0) {
    const { error: delErr } = await sb
      .from('class_enrollments')
      .delete()
      .eq('journey_id', journeyId)
      .in('class_group_id', otherCourseIds)
    if (delErr) throw delErr
  }

  if (levelId === null) return
  const levelCourseIds = courses
    .filter(c => c.parent_semester_id === levelId && c.is_active !== false)
    .map(c => c.id)
  if (levelCourseIds.length === 0) return

  const rows = levelCourseIds.map(class_group_id => ({ journey_id: journeyId, class_group_id }))
  const { error: insErr } = await sb
    .from('class_enrollments')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, { onConflict: 'journey_id,class_group_id', ignoreDuplicates: true })
  if (insErr) throw insErr
}
