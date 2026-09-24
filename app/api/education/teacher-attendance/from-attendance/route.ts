import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDecideTeacherAttendance } from '@/lib/education/teacher-attendance-access'
import { isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * POST /api/education/teacher-attendance/from-attendance
 *   { lesson_id, teacher_person_id, decision: 'approved' | 'rejected' }
 *
 * Решение секретариата по ВИРТУАЛЬНОЙ заявке «דווח דרך נוכחות תלמידות»
 * (решение владельца #5, правило 2): у урока нет отметки преподавателя, но
 * посещаемость учениц отметил teacher_person_id (attendance.marked_by). Решение
 * записывается обычной строкой teacher_attendance (status = decision) — дальше
 * урок живёт как любая отметка: approved → оплачивается, rejected → нет и из
 * очереди уходит. Доступ — как у PATCH [id]: менеджер подразделения урока.
 * Деплой-безопасно (42P01 → 503).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { lesson_id?: string; teacher_person_id?: string; decision?: string }
    const lessonId = (body.lesson_id ?? '').trim()
    const teacherId = (body.teacher_person_id ?? '').trim()
    const decision = (body.decision ?? '').trim()
    if (!lessonId || !teacherId) return apiError('invalid_reference', 400)
    if (decision !== 'approved' && decision !== 'rejected') return apiError('invalid_reference', 400)

    const sb = createServerClient()
    const { data: lesson } = await sb.from('lessons').select('id, is_cancelled').eq('id', lessonId).maybeSingle()
    if (!lesson) return apiError('substage_not_found', 404)
    // Отменённый урок не оплачивается никогда (правило 5).
    if ((lesson as { is_cancelled?: boolean | null }).is_cancelled) return apiError('invalid_reference', 400)

    if (!(await canDecideTeacherAttendance(session, sb, lessonId))) return apiError('forbidden', 403)

    // Заявка должна быть настоящей: этот человек действительно отмечал
    // посещаемость учениц на этом уроке.
    const { data: mark, error: markErr } = await sb.from('attendance')
      .select('id').eq('lesson_id', lessonId).eq('marked_by', teacherId).limit(1)
    if (markErr) throw markErr
    if (!mark || mark.length === 0) return apiError('invalid_reference', 400)

    try {
      const now = new Date().toISOString()
      const { data: existing } = await sb.from('teacher_attendance')
        .select('id').eq('lesson_id', lessonId).eq('teacher_person_id', teacherId).maybeSingle()
      if (existing) {
        const { error } = await sb.from('teacher_attendance')
          .update({ status: decision, decided_by: session.person_id, decided_at: now })
          .eq('id', (existing as { id: string }).id)
        if (error) throw error
      } else {
        const { error } = await sb.from('teacher_attendance').insert({
          lesson_id: lessonId, teacher_person_id: teacherId, status: decision,
          note: 'via_student_attendance', decided_by: session.person_id, decided_at: now,
        })
        if (error) throw error
      }
      return NextResponse.json({ ok: true })
    } catch (e) {
      if (isMissingTable(e)) return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
