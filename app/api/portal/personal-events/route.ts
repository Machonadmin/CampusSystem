import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * Личные события студентки (אירועים אישיים) — ПРИВАТНЫЙ портальный календарь.
 *
 * ЖЁСТКАЯ ПРИВАТНОСТЬ: доступ ТОЛЬКО principal='student'; journey_id берётся из
 * СЕССИИ (student_journey_id), НИКОГДА из тела запроса — ученица не может читать
 * или писать чужие события. Сотрудник (principal!='student') получает 403.
 * Отдельная таблица student_personal_events (не общий calendar_events) —
 * поэтому сотруднические маршруты её вообще не видят.
 *
 *   GET  ?from&to → { events: [{ id, event_date, event_time, title, notes }] }
 *   POST { title, event_date, event_time?, notes? } → { event }
 * Деплой-безопасно (42P01 → пусто / feature 503).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

/** Только студентка со своей journey. Иначе — ошибка (403/401). */
async function requireStudent(): Promise<{ journeyId: string; personId: string } | { err: NextResponse }> {
  const session = await getSession()
  if (!session) return { err: apiError('unauthorized', 401) }
  if (session.principal !== 'student' || !session.student_journey_id) {
    return { err: apiError('forbidden', 403) }
  }
  return { journeyId: session.student_journey_id, personId: session.person_id }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^\d{2}:\d{2}$/

export async function GET(request: NextRequest) {
  try {
    const g = await requireStudent()
    if ('err' in g) return g.err

    const sb = createServerClient()
    const from = request.nextUrl.searchParams.get('from')?.trim()
    const to = request.nextUrl.searchParams.get('to')?.trim()

    try {
      let q = u(sb).from('student_personal_events')
        .select('id, event_date, event_time, title, notes')
        .eq('journey_id', g.journeyId)
        .order('event_date', { ascending: true })
        .order('event_time', { ascending: true, nullsFirst: true })
      if (from && ISO_DATE.test(from)) q = q.gte('event_date', from)
      if (to && ISO_DATE.test(to)) q = q.lte('event_date', to)
      const { data, error } = await q
      if (error) throw error
      return NextResponse.json({ events: data ?? [] })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ events: [] })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await requireStudent()
    if ('err' in g) return g.err

    const body = await request.json().catch(() => ({})) as {
      title?: string; event_date?: string; event_time?: string | null; notes?: string | null
    }
    const title = (body.title ?? '').trim()
    const eventDate = (body.event_date ?? '').trim()
    if (!title) return apiError('validation_error', 400)
    if (!ISO_DATE.test(eventDate)) return apiError('validation_error', 400)
    const eventTime = (body.event_time ?? '').trim()
    if (eventTime && !HHMM.test(eventTime)) return apiError('validation_error', 400)

    const sb = createServerClient()
    try {
      const { data, error } = await u(sb).from('student_personal_events')
        .insert({
          journey_id: g.journeyId,
          person_id: g.personId,
          title,
          event_date: eventDate,
          event_time: eventTime || null,
          notes: (body.notes ?? '').trim() || null,
        })
        .select('id, event_date, event_time, title, notes')
        .single()
      if (error) throw error
      return NextResponse.json({ event: data }, { status: 201 })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
