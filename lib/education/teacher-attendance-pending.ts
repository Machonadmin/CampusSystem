import type { createServerClient } from '@/lib/supabase/server'
import { fetchAllPages } from '@/lib/api/handler'
import { attendanceMarkerFallback, lessonsWithMultipleReports } from '@/lib/education/teacher-hours'

// Очередь «נוכחות מורים» на подтверждение — вынесено из
// app/api/education/teacher-attendance/route.ts без изменений логики, чтобы
// ту же очередь (реальные + виртуальные заявки) показывал и «מרחב המנהל».

/** .in() по длинному списку id режем на куски (длина URL PostgREST). */
const IN_CHUNK = 150
export function chunks<T>(arr: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Окно виртуальных заявок «через посещаемость»: с 1-го числа позапрошлого месяца по сегодня. */
export function virtualWindow(today = new Date()): { from: string; to: string } {
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1)).toISOString().slice(0, 10)
  return { from, to: today.toISOString().slice(0, 10) }
}

/** lesson_id → department_id (через class_group). Для скоупинга очереди по подразделению. */
export async function lessonDepartments(sb: ReturnType<typeof createServerClient>, lessonIds: string[]) {
  const byLesson = new Map<string, string | null>()
  const ids = [...new Set(lessonIds.filter(Boolean))]
  if (ids.length === 0) return byLesson
  for (const part of chunks(ids)) {
    const { data: lessons } = await sb.from('lessons')
      .select('id, class_group:class_groups(department_id)').in('id', part)
    for (const l of (lessons ?? []) as unknown as Array<{ id: string; class_group: { department_id: string | null } | null }>) {
      byLesson.set(l.id, l.class_group?.department_id ?? null)
    }
  }
  return byLesson
}

export async function lessonInfo(sb: ReturnType<typeof createServerClient>, lessonIds: string[]) {
  const byId = new Map<string, { date: string | null; time: string | null; group_name: string; subject: string | null }>()
  const ids = [...new Set(lessonIds.filter(Boolean))]
  if (ids.length === 0) return byId
  for (const part of chunks(ids)) {
    const { data: lessons } = await sb.from('lessons')
      .select('id, scheduled_date, scheduled_time, class_group:class_groups(name, subject:subjects(name))')
      .in('id', part)
    for (const l of (lessons ?? []) as unknown as Array<{ id: string; scheduled_date: string | null; scheduled_time: string | null; class_group: { name: string; subject: { name: string } | null } | null }>) {
      byId.set(l.id, {
        date: l.scheduled_date, time: l.scheduled_time?.slice(0, 5) ?? null,
        group_name: l.class_group?.name ?? '', subject: l.class_group?.subject?.name ?? null,
      })
    }
  }
  return byId
}

export type PendingItem = {
  id: string
  lesson_id: string
  teacher_person_id: string
  status: string
  note: string | null
  reported_at: string | null
  /** Виртуальная заявка (строки teacher_attendance ещё нет) — решается через /from-attendance. */
  virtual: boolean
  /** «דווח דרך נוכחות תלמידות»: кандидат — тот, кто отметил посещаемость учениц. */
  via_student_attendance: boolean
  /** «שני מורים דיווחו»: по уроку отметились два и более преподавателя. */
  two_teachers: boolean
}

/** Все отметки преподавателей (любой статус) по урокам — для пометки «два преподавателя». */
export async function reportsForLessons(sb: ReturnType<typeof createServerClient>, lessonIds: string[]) {
  const out: Array<{ lesson_id: string; teacher_person_id: string; status: string }> = []
  for (const part of chunks([...new Set(lessonIds.filter(Boolean))])) {
    const { data, error } = await sb.from('teacher_attendance')
      .select('lesson_id, teacher_person_id, status').in('lesson_id', part)
    if (error) throw error
    out.push(...((data ?? []) as typeof out))
  }
  return out
}

/**
 * Виртуальные заявки (решение #5, правило 2): неотменённые уроки окна
 * virtualWindow(), где есть посещаемость учениц, но НЕТ ни одной отметки
 * преподавателя → заявка на того, кто отметил посещаемость (attendance.marked_by).
 * В БД ничего не пишется, пока секретариат не решит (POST /from-attendance).
 */
export async function virtualMarkerItems(sb: ReturnType<typeof createServerClient>): Promise<PendingItem[]> {
  const { from, to } = virtualWindow()
  const lessons = await fetchAllPages<{ id: string; is_cancelled: boolean | null }>((f, t) => sb.from('lessons')
    .select('id, is_cancelled').gte('scheduled_date', from).lte('scheduled_date', to)
    .order('id', { ascending: true }).range(f, t))
  const live = lessons.filter(l => !l.is_cancelled).map(l => l.id)
  if (live.length === 0) return []
  const marks: Array<{ lesson_id: string; marked_by: string | null }> = []
  for (const part of chunks(live)) {
    marks.push(...await fetchAllPages<{ lesson_id: string; marked_by: string | null }>((f, t) => sb.from('attendance')
      .select('id, lesson_id, marked_by').in('lesson_id', part).not('marked_by', 'is', null)
      .order('id', { ascending: true }).range(f, t)))
  }
  const reports = await reportsForLessons(sb, marks.map(m => m.lesson_id))
  return attendanceMarkerFallback(marks, reports).map(v => ({
    id: `virtual:${v.lesson_id}:${v.teacher_person_id}`,
    lesson_id: v.lesson_id, teacher_person_id: v.teacher_person_id,
    status: 'reported', note: null, reported_at: null,
    virtual: true, via_student_attendance: true, two_teachers: false,
  }))
}

/**
 * Вся очередь на подтверждение БЕЗ скоупа по подразделению: реальные отметки
 * (status='reported') + виртуальные заявки + пометка «два преподавателя».
 * Скоуп по подразделению накладывает вызывающий.
 */
export async function loadPendingTeacherAttendance(sb: ReturnType<typeof createServerClient>): Promise<PendingItem[]> {
  const { data, error } = await sb.from('teacher_attendance')
    .select('id, lesson_id, teacher_person_id, status, note, reported_at')
    .eq('status', 'reported')
    .order('reported_at', { ascending: true })
  if (error) throw error
  const real = (data ?? []) as Array<{ id: string; lesson_id: string; teacher_person_id: string; status: string; note: string | null; reported_at: string }>
  const rows: PendingItem[] = real.map(r => ({ ...r, virtual: false, via_student_attendance: false, two_teachers: false }))

  // Решение #5, правило 2: урок без отметки преподавателя, но с
  // посещаемостью учениц → виртуальная заявка тому, кто отметил посещаемость.
  rows.push(...await virtualMarkerItems(sb))

  // Решение #5, правило 4: по уроку отметились два преподавателя → пометка.
  const multi = lessonsWithMultipleReports(await reportsForLessons(sb, rows.map(r => r.lesson_id)))
  for (const r of rows) r.two_teachers = multi.has(r.lesson_id)
  return rows
}
