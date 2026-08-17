import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'
import { u, getSurveyWithQuestions, namesFor } from '@/lib/education/teaching-surveys'

/**
 * Один сбор «הערכת הוראה».
 *   GET    → { survey, questions, teachers } (список преподавателей для оценки).
 *   PATCH  → { title?, is_open?, questions? } — правка. Вопросы можно менять
 *            только пока нет ни одного отклика (иначе теряются ответы).
 *   DELETE → удалить сбор (каскадом вопросы/отклики/ответы).
 * Доступ: manage_students / superadmin.
 */
async function requireManager() {
  const session = await getSession()
  if (!session) return { error: apiError('unauthorized', 401) }
  if (session.principal === 'student') return { error: apiError('forbidden', 403) }
  const ok = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_students')
  if (!ok) return { error: apiError('forbidden', 403) }
  return { session }
}

async function teacherList(sb: ReturnType<typeof createServerClient>) {
  const { data: ct } = await sb.from('class_teachers').select('teacher_id')
  return namesFor(sb, (ct ?? []).map(r => (r as { teacher_id: string }).teacher_id))
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const gate = await requireManager()
    if (gate.error) return gate.error
    const sb = createServerClient()
    try {
      const detail = await getSurveyWithQuestions(sb, params.id)
      if (!detail) return apiError('substage_not_found', 404)
      const teachers = await teacherList(sb)
      return NextResponse.json({ ...detail, teachers })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const gate = await requireManager()
    if (gate.error) return gate.error
    const body = await request.json().catch(() => ({})) as {
      title?: string; is_open?: boolean
      questions?: Array<{ text: string; kind?: string; position?: number }>
    }
    const sb = createServerClient()
    try {
      const { data: survey } = await u(sb).from('teaching_surveys').select('id').eq('id', params.id).maybeSingle()
      if (!survey) return apiError('substage_not_found', 404)

      const patch: Record<string, unknown> = {}
      if (typeof body.title === 'string') { const t = body.title.trim(); if (t) patch.title = t }
      if (typeof body.is_open === 'boolean') patch.is_open = body.is_open
      if (Object.keys(patch).length) {
        const { error } = await u(sb).from('teaching_surveys').update(patch).eq('id', params.id)
        if (error) throw error
      }

      if (Array.isArray(body.questions)) {
        // Менять вопросы можно только пока нет откликов.
        const { data: resp } = await u(sb).from('teaching_survey_responses').select('id').eq('survey_id', params.id).limit(1)
        if ((resp ?? []).length > 0) return apiError('survey_has_responses', 409)
        // Полная замена набора вопросов.
        await u(sb).from('teaching_survey_questions').delete().eq('survey_id', params.id)
        const clean = body.questions
          .map((q, i) => ({ text: (q.text ?? '').trim(), kind: q.kind === 'text' ? 'text' : 'rating', position: Number.isFinite(q.position) ? Number(q.position) : i }))
          .filter(q => q.text)
        if (clean.length) {
          const { error } = await u(sb).from('teaching_survey_questions')
            .insert(clean.map(q => ({ survey_id: params.id, text: q.text, kind: q.kind, position: q.position })))
          if (error) throw error
        }
      }
      return NextResponse.json({ ok: true })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const gate = await requireManager()
    if (gate.error) return gate.error
    const sb = createServerClient()
    try {
      const { error } = await u(sb).from('teaching_surveys').delete().eq('id', params.id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
