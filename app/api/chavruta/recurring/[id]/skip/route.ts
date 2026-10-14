import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { isChavrutaTeacher } from '@/lib/chavruta/teachers'
import { isIsoDate } from '@/lib/dates'
import { isMissingRelation } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * Ответ моры «встреча не состоялась» для её «חברותא קבועה» на дату
 * (таблица chavruta_skips). На зарплату не влияет — оплачиваются только
 * записанные встречи; ответ лишь закрывает вопрос после встречи.
 *   POST   { date } — встреча не состоялась.
 *   DELETE ?date=   — отменить ответ.
 * Только своя пара. Деплой-безопасно: до миграции 20261013140000 — 503.
 */

async function ownPair(personId: string, pairId: string) {
  const sb = createServerClient()
  if (!(await isChavrutaTeacher(sb, personId))) return { error: apiError('forbidden', 403) }
  const { data, error } = await sb.from('chavruta_pairs')
    .select('id').eq('id', pairId).eq('teacher_person_id', personId).maybeSingle()
  if (error) {
    if (isMissingRelation(error)) return { error: apiError('feature_not_migrated', 503) }
    throw error
  }
  if (!data) return { error: apiError('not_found', 404) }
  return { sb }
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { date?: string }
    const date = (body.date ?? '').trim()
    if (!isIsoDate(date)) return apiError('invalid_reference', 400)

    const own = await ownPair(session.person_id, params.id)
    if (own.error) return own.error

    const { error } = await own.sb.from('chavruta_skips')
      .upsert({ pair_id: params.id, skip_date: date, created_by: session.person_id }, { onConflict: 'pair_id,skip_date', ignoreDuplicates: true })
    if (error) {
      if (isMissingRelation(error)) return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const date = (request.nextUrl.searchParams.get('date') ?? '').trim()
    if (!isIsoDate(date)) return apiError('invalid_reference', 400)

    const own = await ownPair(session.person_id, params.id)
    if (own.error) return own.error

    const { error } = await own.sb.from('chavruta_skips')
      .delete().eq('pair_id', params.id).eq('skip_date', date)
    if (error) {
      if (isMissingRelation(error)) return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
