import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { mapDbError } from '@/lib/calendar/http'
import { isIsoDate, isIsoDateTime } from '@/lib/calendar/validation'
import { hasOverlappingAppointment } from '@/lib/calendar/overlap'
import type { AppointmentInsert } from '@/types/database'

/**
 * ЛИЧНЫЙ календарь. Все операции self-scoped: provider_id = session.person_id,
 * НИКОГДА не чужой календарь.
 *
 * GET  /api/calendar/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   — встречи пользователя в диапазоне (по starts_at), + имя студента, если
 *     задан journey_id. from/to опциональны (обе или ни одной).
 * POST /api/calendar/appointments
 *   — создать: title, journey_id?, starts_at, ends_at, reason?. Валидируем
 *     ISO-таймстемпы, ends_at > starts_at, и отсутствие пересечения со СВОИМИ
 *     запланированными встречами (409).
 */

const COLS =
  'id, provider_id, journey_id, title, reason, starts_at, ends_at, status, notes, created_by, created_at, updated_at'

// Читаем встречи постранично: у активного сотрудника их может накопиться >1000.
const PAGE = 1000

export async function GET(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()

    const from = request.nextUrl.searchParams.get('from')?.trim()
    const to = request.nextUrl.searchParams.get('to')?.trim()
    if (from && !isIsoDate(from)) {
      return NextResponse.json({ error: 'from должен быть датой YYYY-MM-DD' }, { status: 400 })
    }
    if (to && !isIsoDate(to)) {
      return NextResponse.json({ error: 'to должен быть датой YYYY-MM-DD' }, { status: 400 })
    }

    type Row = {
      id: string
      journey_id: string | null
      title: string
      reason: string | null
      starts_at: string
      ends_at: string
      status: string
      notes: string | null
      journey: unknown
    }
    const rows: Row[] = []
    let offset = 0
    for (;;) {
      let q = sb
        .from('appointments')
        .select(`
          id, journey_id, title, reason, starts_at, ends_at, status, notes,
          journey:education_journeys!appointments_journey_id_fkey(
            id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)
          )
        `)
        .eq('provider_id', session.person_id)
        .order('starts_at', { ascending: true })
        .range(offset, offset + PAGE - 1)
      // from/to фильтруют по началу встречи. to — включительно по дню.
      if (from) q = q.gte('starts_at', `${from}T00:00:00`)
      if (to) q = q.lte('starts_at', `${to}T23:59:59.999`)

      const { data, error } = await q
      if (error) throw error
      const page = (data ?? []) as unknown as Row[]
      rows.push(...page)
      if (page.length < PAGE) break
      offset += PAGE
    }

    const appointments = rows.map(r => {
      const journey = r.journey as { person?: { full_name?: string | null; hebrew_name?: string | null } | null } | null
      const person = journey?.person ?? null
      return {
        id: r.id,
        journey_id: r.journey_id,
        title: r.title,
        reason: r.reason,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        status: r.status,
        notes: r.notes,
        student_name: person?.full_name ?? null,
        student_hebrew_name: person?.hebrew_name ?? null,
      }
    })

    return NextResponse.json({ appointments })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireCalendarUser()

    const body = await request.json() as {
      title?: string
      journey_id?: string | null
      starts_at?: string
      ends_at?: string
      reason?: string | null
      notes?: string | null
    }

    const title = body.title?.trim()
    if (!title) {
      return NextResponse.json({ error: 'title обязателен' }, { status: 400 })
    }
    if (!isIsoDateTime(body.starts_at) || !isIsoDateTime(body.ends_at)) {
      return NextResponse.json({ error: 'starts_at и ends_at должны быть датой-временем ISO' }, { status: 400 })
    }
    if (Date.parse(body.ends_at) <= Date.parse(body.starts_at)) {
      return NextResponse.json({ error: 'ends_at должен быть позже starts_at' }, { status: 400 })
    }

    const sb = createServerClient()

    // Защита от двойного бронирования: 409 при пересечении со СВОЕЙ scheduled.
    const overlap = await hasOverlappingAppointment(sb, session.person_id, body.starts_at, body.ends_at)
    if (overlap) {
      return NextResponse.json({ error: 'Встреча пересекается с уже запланированной' }, { status: 409 })
    }

    const insert: AppointmentInsert = {
      provider_id: session.person_id,
      journey_id: body.journey_id?.trim() || null,
      title,
      reason: body.reason?.trim() || null,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      notes: body.notes?.trim() || null,
      created_by: session.person_id,
    }

    const { data, error } = await sb
      .from('appointments')
      .insert(insert as never)
      .select(COLS)
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
