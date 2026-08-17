import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'
import { u } from '@/lib/education/teaching-surveys'

/**
 * הערכת הוראה — сборы обратной связи о преподавании.
 *   GET  → список сборов (менеджер).
 *   POST { title } → создать сбор (закрыт по умолчанию).
 * Доступ: manage_students (в любом подразделении) / superadmin. Deploy-safe.
 */
async function requireManager() {
  const session = await getSession()
  if (!session) return { error: apiError('unauthorized', 401) }
  if (session.principal === 'student') return { error: apiError('forbidden', 403) }
  const ok = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_students')
  if (!ok) return { error: apiError('forbidden', 403) }
  return { session }
}

export async function GET() {
  try {
    const gate = await requireManager()
    if (gate.error) return gate.error
    const sb = createServerClient()
    try {
      const { data, error } = await u(sb).from('teaching_surveys')
        .select('id, title, is_open, created_at').order('created_at', { ascending: false })
      if (error) throw error
      // Кол-во откликов на сбор — для списка.
      const rows = (data ?? []) as Array<{ id: string; title: string; is_open: boolean; created_at: string }>
      const counts = new Map<string, number>()
      if (rows.length) {
        const { data: resp } = await u(sb).from('teaching_survey_responses').select('survey_id').in('survey_id', rows.map(r => r.id))
        for (const r of (resp ?? []) as Array<{ survey_id: string }>) counts.set(r.survey_id, (counts.get(r.survey_id) ?? 0) + 1)
      }
      return NextResponse.json({ items: rows.map(r => ({ ...r, responses: counts.get(r.id) ?? 0 })) })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ items: [] })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireManager()
    if (gate.error) return gate.error
    const body = await request.json().catch(() => ({})) as { title?: string }
    const title = (body.title ?? '').trim()
    if (!title) return apiError('invalid_reference', 400)
    const sb = createServerClient()
    try {
      const { data, error } = await u(sb).from('teaching_surveys')
        .insert({ title, is_open: false, created_by: gate.session!.person_id })
        .select('id, title, is_open, created_at').single()
      if (error) throw error
      return NextResponse.json({ survey: data }, { status: 201 })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
