import type { createServerClient } from '@/lib/supabase/server'
import { lessonHours } from '@/lib/finance/lesson-hours'
import { isMissingRelation } from '@/lib/supabase/errors'

/**
 * ФАКТИЧЕСКИЕ часы преподавания (решение владельца #5) — единый источник цифры
 * для трёх экранов: начисление зарплаты (generate-teaching), «מורים ושעות»
 * (teachers-hours) и квоты кодеша (teacher-quotas).
 *
 * Правила:
 *   • урок оплачивается ТОЛЬКО если секретариат подтвердил отметку
 *     преподавателя: teacher_attendance.status = 'approved'. Отмечено, но не
 *     подтверждено ('reported') → не оплачивается; 'rejected' → никогда;
 *   • отменённый урок (lessons.is_cancelled) → никогда;
 *   • часы урока = lessonHours(scheduled_time, scheduled_end_time); урок без
 *     времени конца пропускается (как раньше), но СЧИТАЕТСЯ — экраны
 *     показывают предупреждение;
 *   • платят тому, чья отметка подтверждена (замещающей — тоже), а не всем
 *     преподавателям группы по class_teachers.
 */

type Sb = ReturnType<typeof createServerClient>

/** Постраничная выборка (PostgREST отдаёт максимум 1000 строк за запрос). Локальная
 *  копия fetchAllPages — без серверных импортов lib/api/handler (юнит-тесты). */
async function allPages<T>(makeQuery: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const PAGE = 1000
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery(from, from + PAGE - 1)
    if (error) throw error
    const chunk = (data ?? []) as T[]
    rows.push(...chunk)
    if (chunk.length < PAGE) break
  }
  return rows
}

export interface ActualLessonLite {
  id: string
  scheduled_date: string
  scheduled_time: string | null
  scheduled_end_time: string | null
  is_cancelled: boolean | null
  class_group_id: string | null
}

export interface ApprovedAttendanceRow {
  lesson_id: string
  teacher_person_id: string
  lesson: ActualLessonLite | null
}

export interface ActualLessonItem {
  lesson_id: string
  date: string
  hours: number
  class_group_id: string | null
}

export interface TeacherActualHours {
  teacher_id: string
  /** Сумма часов (2 знака). */
  hours: number
  /** Сколько уроков вошло в сумму. */
  lessons: number
  /** Подтверждённые уроки без времени конца — в сумму НЕ вошли. */
  no_end_time: number
  items: ActualLessonItem[]
}

export interface ActualHoursResult {
  byTeacher: Map<string, TeacherActualHours>
  /** Всего подтверждённых неотменённых уроков без времени конца (пропущены). */
  noEndTime: number
}

/**
 * Чистая агрегация: подтверждённые отметки (+ их уроки) → часы по преподавателю.
 * Отменённые уроки и строки без урока отбрасываются; урок без времени конца
 * считается в no_end_time. Дубли (урок, преподаватель) учитываются один раз.
 */
export function aggregateActualHours(rows: ApprovedAttendanceRow[]): ActualHoursResult {
  const byTeacher = new Map<string, TeacherActualHours>()
  const cents = new Map<string, number>() // сумма в сотых долях часа — без float-дрейфа
  const seen = new Set<string>()
  let noEndTime = 0
  for (const r of rows) {
    const l = r.lesson
    if (!l || l.is_cancelled) continue
    const key = `${r.lesson_id}|${r.teacher_person_id}`
    if (seen.has(key)) continue
    seen.add(key)
    let t = byTeacher.get(r.teacher_person_id)
    if (!t) {
      t = { teacher_id: r.teacher_person_id, hours: 0, lessons: 0, no_end_time: 0, items: [] }
      byTeacher.set(r.teacher_person_id, t)
    }
    const h = lessonHours(l.scheduled_time, l.scheduled_end_time)
    if (h == null) { t.no_end_time++; noEndTime++; continue }
    t.lessons++
    t.items.push({ lesson_id: r.lesson_id, date: l.scheduled_date, hours: h, class_group_id: l.class_group_id })
    const c = (cents.get(r.teacher_person_id) ?? 0) + Math.round(h * 100)
    cents.set(r.teacher_person_id, c)
    t.hours = c / 100
  }
  for (const t of byTeacher.values()) t.items.sort((a, b) => a.date.localeCompare(b.date))
  return { byTeacher, noEndTime }
}

/**
 * Фактические часы за период [from, to] (даты урока, включительно).
 * teacherIds — ограничить преподавателями; classGroupIds — ограничить группами
 * (квоты кодеша считают только курсы кодеша). Деплой-безопасно: нет таблицы
 * teacher_attendance → пустой результат.
 */
export async function actualTeachingHours(
  sb: Sb,
  opts: { from: string; to: string; teacherIds?: string[]; classGroupIds?: string[] },
): Promise<ActualHoursResult> {
  const empty: ActualHoursResult = { byTeacher: new Map(), noEndTime: 0 }
  if (opts.teacherIds && opts.teacherIds.length === 0) return empty
  if (opts.classGroupIds && opts.classGroupIds.length === 0) return empty
  try {
    const rows = await allPages<ApprovedAttendanceRow>((f, t) => {
      let q = sb.from('teacher_attendance')
        .select('id, lesson_id, teacher_person_id, lesson:lessons!inner(id, scheduled_date, scheduled_time, scheduled_end_time, is_cancelled, class_group_id)')
        .eq('status', 'approved')
        .gte('lesson.scheduled_date', opts.from)
        .lte('lesson.scheduled_date', opts.to)
      if (opts.teacherIds) q = q.in('teacher_person_id', opts.teacherIds)
      if (opts.classGroupIds) q = q.in('lesson.class_group_id', opts.classGroupIds)
      return q.order('id', { ascending: true }).range(f, t)
    })
    return aggregateActualHours(rows)
  } catch (e) {
    if (isMissingRelation(e)) return empty
    throw e
  }
}

// ── Очередь секретариата ────────────────────────────────────────────────────

export interface TeacherReportLite {
  lesson_id: string
  teacher_person_id: string
  status: string
}

/**
 * Уроки, по которым отметились ДВА и более разных преподавателя (не считая
 * отклонённых отметок). Такие уроки «всплывают» у секретариата с пометкой
 * «שני מורים דיווחו» — секретариат решает, кому платить.
 */
export function lessonsWithMultipleReports(reports: TeacherReportLite[]): Set<string> {
  const byLesson = new Map<string, Set<string>>()
  for (const r of reports) {
    if (r.status === 'rejected') continue
    const s = byLesson.get(r.lesson_id) ?? new Set<string>()
    s.add(r.teacher_person_id)
    byLesson.set(r.lesson_id, s)
  }
  const out = new Set<string>()
  for (const [lid, s] of byLesson) if (s.size >= 2) out.add(lid)
  return out
}

export interface AttendanceMarkLite {
  lesson_id: string
  marked_by: string | null
}

export interface MarkerFallbackItem {
  lesson_id: string
  teacher_person_id: string
  /** Сколько отметок учениц сделал этот человек на уроке. */
  marks: number
}

/**
 * «Кто-то отметил»: урок, по которому НЕТ ни одной отметки преподавателя (ни в
 * каком статусе), но есть посещаемость учениц → кандидат на оплату тому, кто
 * отметил посещаемость (attendance.marked_by). Если отмечали несколько человек —
 * берём того, кто отметил больше всех (при равенстве — детерминированно по id).
 * Отменённые уроки (cancelledLessonIds) не попадают никогда.
 * Результат — ВИРТУАЛЬНЫЕ заявки в очередь секретариата; платят только после
 * подтверждения.
 */
export function attendanceMarkerFallback(
  marks: AttendanceMarkLite[],
  reports: Array<Pick<TeacherReportLite, 'lesson_id'>>,
  cancelledLessonIds: Set<string> = new Set(),
): MarkerFallbackItem[] {
  const reported = new Set(reports.map(r => r.lesson_id))
  const counts = new Map<string, Map<string, number>>()
  for (const m of marks) {
    if (!m.marked_by) continue
    if (reported.has(m.lesson_id) || cancelledLessonIds.has(m.lesson_id)) continue
    const c = counts.get(m.lesson_id) ?? new Map<string, number>()
    c.set(m.marked_by, (c.get(m.marked_by) ?? 0) + 1)
    counts.set(m.lesson_id, c)
  }
  const out: MarkerFallbackItem[] = []
  for (const [lessonId, c] of counts) {
    let best: string | null = null, bestN = 0
    for (const [pid, n] of c) {
      if (n > bestN || (n === bestN && best !== null && pid < best)) { best = pid; bestN = n }
    }
    if (best) out.push({ lesson_id: lessonId, teacher_person_id: best, marks: bestN })
  }
  return out.sort((a, b) => a.lesson_id.localeCompare(b.lesson_id))
}
