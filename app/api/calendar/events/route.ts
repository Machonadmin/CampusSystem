import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { isIsoDate } from '@/lib/calendar/validation'
import type { CalendarEventInsert } from '@/types/database'

/**
 * Личные события календаря пользователя.
 *
 * GET  /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD — мои события в диапазоне.
 * POST /api/calendar/events — добавить событие (universal «в календарь»):
 *   { title, event_date, event_time?, reminder_at?, notes?, source_type?, source_id?, link? }
 *
 * Изоляция по owner_id = session.person_id. Защищено к отсутствию таблицы
 * (42P01) — GET отдаёт пусто, чтобы деплой до миграции не ломал календарь.
 */

const PAGE = 2000

export async function GET(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const from = request.nextUrl.searchParams.get('from')?.trim()
    const to = request.nextUrl.searchParams.get('to')?.trim()
    if (from && !isIsoDate(from)) return apiError('from_must_be_date', 400)
    if (to && !isIsoDate(to)) return apiError('to_must_be_date', 400)

    const sb = createServerClient()
    let q = sb
      .from('calendar_events')
      .select('id, title, notes, event_date, event_time, all_day, reminder_at, source_type, source_id, link')
      .eq('owner_id', session.person_id)
      .order('event_date', { ascending: true })
      .order('event_time', { ascending: true, nullsFirst: true })
      .limit(PAGE)
    if (from) q = q.gte('event_date', from)
    if (to) q = q.lte('event_date', to)

    const { data, error } = await q
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ events: [] })
      throw error
    }
    return NextResponse.json({ events: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const body = await request.json().catch(() => ({})) as {
      title?: string
      event_date?: string
      event_time?: string | null
      reminder_at?: string | null
      notes?: string | null
      source_type?: string
      source_id?: string | null
      link?: string | null
    }

    const title = body.title?.trim()
    if (!title) return apiError('title_field_required', 400)
    if (!body.event_date || !isIsoDate(body.event_date)) return apiError('from_must_be_date', 400)

    const time = body.event_time?.trim() || null
    const insert: CalendarEventInsert = {
      owner_id: session.person_id,
      title: title.slice(0, 300),
      notes: body.notes?.trim() || null,
      event_date: body.event_date,
      event_time: time,
      all_day: !time,
      reminder_at: body.reminder_at?.trim() || null,
      source_type: body.source_type?.trim() || 'manual',
      source_id: body.source_id?.trim() || null,
      link: body.link?.trim() || null,
      created_by: session.person_id,
    }

    const sb = createServerClient()
    const { data, error } = await sb
      .from('calendar_events')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insert as any)
      .select('id')
      .single()
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ error: serverT('generic_error') }, { status: 503 })
      if (error.code === '23505') return NextResponse.json({ ok: true, duplicate: true }) // уже в календаре
      throw error
    }
    return NextResponse.json({ ok: true, id: data?.id }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
