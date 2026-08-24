import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getEducationPrivilegeScope, hasEducationPrivilege } from '@/lib/education/permissions'
import { getSurveyWithQuestions, namesFor, surveyDepartment } from '@/lib/education/teaching-surveys'

/**
 * GET /api/education/teaching-surveys/[id]/results
 * Результаты сбора, сгруппированные по преподавателю. По каждому вопросу —
 * средний балл (рейтинг) и текстовые ответы; отклики с именем респондента и
 * ролью (ученица/менеджер) — сбор НЕ анонимный (решение владельца).
 * Доступ: manage_students / superadmin.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const sb = createServerClient()
    // Право — manage_students в подразделении сбора (или superadmin; legacy без
    // подразделения — только scope='all').
    const { found, department_id } = await surveyDepartment(sb, params.id)
    if (!found) return apiError('substage_not_found', 404)
    const ok = session.roles.includes('superadmin')
      || (department_id
        ? await hasEducationPrivilege(session, 'manage_students', { department_id })
        : (await getEducationPrivilegeScope(session, 'manage_students')) === 'all')
    if (!ok) return apiError('forbidden', 403)

    try {
      const detail = await getSurveyWithQuestions(sb, params.id)
      if (!detail) return apiError('substage_not_found', 404)

      const { data: respRaw } = await sb.from('teaching_survey_responses')
        .select('id, teacher_person_id, respondent_person_id, respondent_role, submitted_at').eq('survey_id', params.id)
      const responses = (respRaw ?? []) as Array<{ id: string; teacher_person_id: string; respondent_person_id: string; respondent_role: string; submitted_at: string }>

      const answersByResponse = new Map<string, Array<{ question_id: string; rating: number | null; text_value: string | null }>>()
      if (responses.length) {
        const { data: ansRaw } = await sb.from('teaching_survey_answers')
          .select('response_id, question_id, rating, text_value').in('response_id', responses.map(r => r.id))
        for (const a of (ansRaw ?? []) as Array<{ response_id: string; question_id: string; rating: number | null; text_value: string | null }>) {
          const arr = answersByResponse.get(a.response_id) ?? []
          arr.push({ question_id: a.question_id, rating: a.rating, text_value: a.text_value })
          answersByResponse.set(a.response_id, arr)
        }
      }

      // Имена: преподаватели + респонденты.
      const nameMap = new Map((await namesFor(sb, [...responses.map(r => r.teacher_person_id), ...responses.map(r => r.respondent_person_id)])).map(x => [x.person_id, x.name]))

      // Группировка по преподавателю.
      const byTeacher = new Map<string, {
        person_id: string; name: string
        responses: Array<{ respondent_name: string; respondent_role: string; submitted_at: string; answers: Record<string, { rating: number | null; text_value: string | null }> }>
      }>()
      for (const r of responses) {
        const t = byTeacher.get(r.teacher_person_id) ?? { person_id: r.teacher_person_id, name: nameMap.get(r.teacher_person_id) ?? '—', responses: [] }
        const answers: Record<string, { rating: number | null; text_value: string | null }> = {}
        for (const a of answersByResponse.get(r.id) ?? []) answers[a.question_id] = { rating: a.rating, text_value: a.text_value }
        t.responses.push({ respondent_name: nameMap.get(r.respondent_person_id) ?? '—', respondent_role: r.respondent_role, submitted_at: r.submitted_at, answers })
        byTeacher.set(r.teacher_person_id, t)
      }

      const teachers = [...byTeacher.values()].sort((a, b) => a.name.localeCompare(b.name, 'he'))
      return NextResponse.json({ survey: detail.survey, questions: detail.questions, teachers })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
