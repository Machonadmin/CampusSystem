import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, LessonRow, AssessmentRow, ScheduleSlotRow } from '@/types/database'
import type { PrivilegeTarget } from './permissions'

// ─── Общее ─────────────────────────────────────────────────────────────────────
//
// Хелперы для роутов уроков/посещаемости: строят PrivilegeTarget учебной группы
// (её department_id + список teacher_ids из class_teachers), чтобы
// requireEducationPrivilege мог проверить scope='department' и scope='own'.
//
// Логика идентична той, что делают существующие роуты class-groups:
//   department_id — из class_groups.department_id
//   teacher_ids   — из class_teachers.teacher_id по class_group_id

type SB = SupabaseClient<Database>

/**
 * Строит PrivilegeTarget для учебной группы: её department_id и массив
 * teacher_ids (преподаватели из class_teachers). Возвращает null, если
 * группа не найдена.
 */
export async function getClassGroupTarget(
  sb: SB,
  classGroupId: string,
): Promise<PrivilegeTarget | null> {
  const { data: group, error: gErr } = await sb
    .from('class_groups')
    .select('department_id')
    .eq('id', classGroupId)
    .maybeSingle()
  if (gErr) throw gErr
  if (!group) return null

  const { data: teachers, error: tErr } = await sb
    .from('class_teachers')
    .select('teacher_id')
    .eq('class_group_id', classGroupId)
  if (tErr) throw tErr

  return {
    department_id: group.department_id,
    teacher_ids: (teachers ?? []).map(t => t.teacher_id),
  }
}

export interface LessonAccess {
  lesson: LessonRow
  target: PrivilegeTarget
}

/**
 * Загружает урок и строит PrivilegeTarget его учебной группы.
 * Возвращает null, если урок не найден.
 */
export async function getLessonAccess(
  sb: SB,
  lessonId: string,
): Promise<LessonAccess | null> {
  const { data: lesson, error } = await sb
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .maybeSingle()
  if (error) throw error
  if (!lesson) return null

  const row = lesson as LessonRow
  const target = await getClassGroupTarget(sb, row.class_group_id)
  // Группа обязана существовать (FK), но на всякий случай отдаём {} —
  // тогда scope='own' даст отказ, а scope='all' сработает как обычно.
  return { lesson: row, target: target ?? {} }
}

/**
 * Возвращает множество journey_id, записанных в учебную группу.
 * Используется для валидации отметок посещаемости и оценок.
 */
export async function getEnrolledJourneyIds(
  sb: SB,
  classGroupId: string,
): Promise<Set<string>> {
  const { data, error } = await sb
    .from('class_enrollments')
    .select('journey_id')
    .eq('class_group_id', classGroupId)
  if (error) throw error
  return new Set((data ?? []).map(r => r.journey_id))
}

export interface AssessmentAccess {
  assessment: AssessmentRow
  target: PrivilegeTarget
}

/**
 * Загружает задание (assessment) и строит PrivilegeTarget его учебной группы.
 * Возвращает null, если задание не найдено. Полная аналогия getLessonAccess.
 */
export async function getAssessmentAccess(
  sb: SB,
  assessmentId: string,
): Promise<AssessmentAccess | null> {
  const { data: assessment, error } = await sb
    .from('assessments')
    .select('*')
    .eq('id', assessmentId)
    .maybeSingle()
  if (error) throw error
  if (!assessment) return null

  const row = assessment as AssessmentRow
  const target = await getClassGroupTarget(sb, row.class_group_id)
  // Группа обязана существовать (FK), но на всякий случай отдаём {} —
  // тогда scope='own' даст отказ, а scope='all' сработает как обычно.
  return { assessment: row, target: target ?? {} }
}

export interface SlotAccess {
  slot: ScheduleSlotRow
  target: PrivilegeTarget
}

/**
 * Загружает слот расписания и строит PrivilegeTarget его учебной группы.
 * Возвращает null, если слот не найден. Полная аналогия getAssessmentAccess.
 */
export async function getSlotAccess(
  sb: SB,
  slotId: string,
): Promise<SlotAccess | null> {
  const { data: slot, error } = await sb
    .from('class_schedule_slots')
    .select('*')
    .eq('id', slotId)
    .maybeSingle()
  if (error) throw error
  if (!slot) return null

  const row = slot as ScheduleSlotRow
  const target = await getClassGroupTarget(sb, row.class_group_id)
  // Группа обязана существовать (FK), но на всякий случай отдаём {} —
  // тогда scope='own' даст отказ, а scope='all' сработает как обычно.
  return { slot: row, target: target ?? {} }
}
