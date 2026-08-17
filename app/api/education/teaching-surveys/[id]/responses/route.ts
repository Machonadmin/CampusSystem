import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'
import { submitResponse, type SubmitAnswer } from '@/lib/education/teaching-surveys'

/**
 * POST /api/education/teaching-surveys/[id]/responses
 *   { teacher_person_id, answers: [{ question_id, rating?, text_value? }] }
 * Менеджер заполняет оценку преподавания по одному преподавателю (с именем).
 * Доступ: manage_students / superadmin. Сбор должен быть открыт.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)
    const ok = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_students')
    if (!ok) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { teacher_person_id?: string; answers?: SubmitAnswer[] }
    const teacherPersonId = (body.teacher_person_id ?? '').trim()
    if (!teacherPersonId) return apiError('invalid_reference', 400)

    const sb = createServerClient()
    try {
      const res = await submitResponse(sb, {
        surveyId: params.id, teacherPersonId, respondentPersonId: session.person_id,
        role: 'manager', answers: Array.isArray(body.answers) ? body.answers : [],
      })
      if ('code' in res) {
        if (res.code === 'not_found') return apiError('substage_not_found', 404)
        if (res.code === 'survey_closed') return apiError('survey_closed', 409)
        return apiError('invalid_reference', 400)
      }
      return NextResponse.json({ ok: true }, { status: 201 })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
