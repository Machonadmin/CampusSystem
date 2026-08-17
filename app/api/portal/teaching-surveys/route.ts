import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { u, resolveStudentTeachers, getSurveyWithQuestions } from '@/lib/education/teaching-surveys'

/**
 * GET /api/portal/teaching-surveys
 * Для ученицы: открытые сборы «הערכת הוראה» + её преподаватели (по её группам) +
 * флаг, ответила ли она уже по каждому преподавателю. Строго self-scoped:
 * journey из сессии. Deploy-safe (нет таблиц → пусто).
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.principal !== 'student' || !session.student_journey_id) {
      return NextResponse.json({ surveys: [] })
    }
    const sb = createServerClient()
    try {
      const { data: openRaw } = await u(sb).from('teaching_surveys').select('id, title').eq('is_open', true).order('created_at', { ascending: false })
      const open = (openRaw ?? []) as Array<{ id: string; title: string }>
      if (open.length === 0) return NextResponse.json({ surveys: [] })

      const teachers = await resolveStudentTeachers(sb, session.student_journey_id)
      if (teachers.length === 0) return NextResponse.json({ surveys: [] })
      const teacherIds = teachers.map(t => t.person_id)

      // Что уже отвечено этой ученицей.
      const { data: mine } = await u(sb).from('teaching_survey_responses')
        .select('survey_id, teacher_person_id').eq('respondent_person_id', session.person_id).in('survey_id', open.map(s => s.id))
      const answered = new Set((mine ?? []).map(r => `${(r as { survey_id: string }).survey_id}:${(r as { teacher_person_id: string }).teacher_person_id}`))

      const surveys = []
      for (const s of open) {
        const detail = await getSurveyWithQuestions(sb, s.id)
        if (!detail || detail.questions.length === 0) continue
        surveys.push({
          id: s.id, title: s.title, questions: detail.questions,
          teachers: teachers.map(t => ({ ...t, answered: answered.has(`${s.id}:${t.person_id}`) })),
        })
      }
      return NextResponse.json({ surveys })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ surveys: [] })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
