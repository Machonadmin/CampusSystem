import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { isChavrutaTeacher } from '@/lib/chavruta/teachers'
import { parseSchedule } from '@/lib/chavruta/schedule'
import { isMissingRelation, isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * Одна «חברותא קבועה» моры (пара в chavruta_pairs). Только своя пара.
 *   PATCH  { weekday?, start_time? } — день недели (0 = вс … 6 = сб) и время
 *          встречи; null — очистить (тогда без напоминаний).
 *   DELETE — снять ученицу из «קבועות». Деактивация (is_active=false), как снятие
 *          пары в «מרכז חברותא»: записанные встречи не трогаются.
 * Деплой-безопасно: до миграции 20261013140000 PATCH отвечает 503.
 */

async function guard() {
  const session = await getSession()
  if (!session) return { error: apiError('unauthorized', 401) }
  if (session.principal === 'student') return { error: apiError('forbidden', 403) }
  const sb = createServerClient()
  if (!(await isChavrutaTeacher(sb, session.person_id))) return { error: apiError('forbidden', 403) }
  return { session, sb }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const g = await guard()
    if (g.error) return g.error
    const { session, sb } = g

    const body = await request.json().catch(() => ({})) as { weekday?: unknown; start_time?: unknown }
    const schedule = parseSchedule(body)
    if (!schedule || Object.keys(schedule).length === 0) return apiError('invalid_reference', 400)

    const { data, error } = await sb.from('chavruta_pairs')
      .update(schedule)
      .eq('id', params.id).eq('teacher_person_id', session.person_id).eq('is_active', true)
      .select('id, weekday, start_time')
    if (error) {
      if (isMissingRelation(error)) return apiError('feature_not_migrated', 503)
      throw error
    }
    if (!data || data.length === 0) return apiError('not_found', 404)
    return NextResponse.json({ recurring: data[0] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const g = await guard()
    if (g.error) return g.error
    const { session, sb } = g

    try {
      const { data, error } = await sb.from('chavruta_pairs')
        .update({ is_active: false })
        .eq('id', params.id).eq('teacher_person_id', session.person_id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) return apiError('not_found', 404)
    } catch (e) {
      if (isMissingTable(e)) return apiError('feature_not_migrated', 503)
      throw e
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
