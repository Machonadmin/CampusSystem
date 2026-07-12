import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { mapDbError } from '@/lib/calendar/http'
import { isIsoDate, isIsoDateTime } from '@/lib/calendar/validation'
import { hasOverlappingAppointment } from '@/lib/calendar/overlap'
import type { AppointmentInsert } from '@/types/database'

/**
 * ЛИЧНЫЙ календарь + СИНХРОНИЗАЦИЯ. GET отдаёт две группы встреч:
 *   • role='provider'  — встречи, которые пользователь создал сам
 *     (provider_id = session.person_id). Полностью редактируемые.
 *   • role='participant' — встречи, назначенные пользователю кем-то другим:
 *     он привязан как студент (appointments.journey_id → education_journeys,
 *     где person_id = session.person_id), а provider_id ≠ он. READ-ONLY.
 * Если одна и та же встреча попадает в обе группы (сам поставил встречу со
 * своим journey), остаётся ОДНА строка с role='provider' (provider wins).
 *
 * GET  /api/calendar/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   — from/to опциональны, фильтруют по началу встречи (starts_at). ОБА запроса
 *     (свои и назначенные) читаются постранично (>1000 строк у PostgREST режутся).
 * POST /api/calendar/appointments
 *   — создать: title, journey_id?, starts_at, ends_at, reason?. Валидируем
 *     ISO-таймстемпы, ends_at > starts_at, и отсутствие пересечения со СВОИМИ
 *     запланированными встречами (409). POST всегда self-scoped (provider_id = я).
 */

const COLS =
  'id, provider_id, journey_id, title, reason, starts_at, ends_at, status, notes, created_by, created_at, updated_at'

// Читаем встречи постранично: у активного сотрудника их может накопиться >1000.
const PAGE = 1000

// SELECT для GET: встреча + студент (journey→person) + провайдер (кто назначил).
const GET_SELECT = `
  id, provider_id, journey_id, title, reason, starts_at, ends_at, status, notes,
  journey:education_journeys!appointments_journey_id_fkey(
    id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)
  ),
  provider:persons!appointments_provider_id_fkey(id, full_name, hebrew_name)
`

type GetRow = {
  id: string
  provider_id: string
  journey_id: string | null
  title: string
  reason: string | null
  starts_at: string
  ends_at: string
  status: string
  notes: string | null
  journey: unknown
  provider: unknown
}

type PersonLite = { full_name?: string | null; hebrew_name?: string | null } | null

export async function GET(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()

    const from = request.nextUrl.searchParams.get('from')?.trim()
    const to = request.nextUrl.searchParams.get('to')?.trim()
    if (from && !isIsoDate(from)) {
      return apiError('from_must_be_date', 400)
    }
    if (to && !isIsoDate(to)) {
      return apiError('to_must_be_date', 400)
    }

    // Постраничная выборка встреч по одному критерию отбора (provider или journey).
    // Каждая страница — новый builder, т.к. PostgrestBuilder одноразовый; from/to
    // (по началу встречи, to — включительно по дню) применяются к каждой странице.
    async function fetchAllPaged(
      scope: { by: 'provider'; id: string } | { by: 'journeys'; ids: string[] },
    ): Promise<GetRow[]> {
      const out: GetRow[] = []
      let offset = 0
      for (;;) {
        let q = sb
          .from('appointments')
          .select(GET_SELECT)
          .order('starts_at', { ascending: true })
          .range(offset, offset + PAGE - 1)
        q = scope.by === 'provider'
          ? q.eq('provider_id', scope.id)
          : q.in('journey_id', scope.ids)
        if (from) q = q.gte('starts_at', `${from}T00:00:00`)
        if (to) q = q.lte('starts_at', `${to}T23:59:59.999`)

        const { data, error } = await q
        if (error) throw error
        const page = (data ?? []) as unknown as GetRow[]
        out.push(...page)
        if (page.length < PAGE) break
        offset += PAGE
      }
      return out
    }

    // 1) Свои встречи (provider_id = я) — полностью редактируемые.
    const providerRows = await fetchAllPaged({ by: 'provider', id: session.person_id })

    // 2) Встречи, назначенные мне: сначала находим journey_id, где person_id = я.
    const { data: journeyData, error: jErr } = await sb
      .from('education_journeys')
      .select('id')
      .eq('person_id', session.person_id)
    if (jErr) throw jErr
    const journeyIds = (journeyData ?? []).map(r => r.id as string)

    let participantRows: GetRow[] = []
    // ВАЖНО: не запускать .in() с пустым массивом — иначе вернёт всё подряд.
    if (journeyIds.length > 0) {
      participantRows = await fetchAllPaged({ by: 'journeys', ids: journeyIds })
    }

    function mapRow(r: GetRow, role: 'provider' | 'participant') {
      const journey = r.journey as { person?: PersonLite } | null
      const student = journey?.person ?? null
      const provider = role === 'participant' ? (r.provider as PersonLite) : null
      return {
        id: r.id,
        journey_id: r.journey_id,
        title: r.title,
        reason: r.reason,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        status: r.status,
        notes: r.notes,
        student_name: student?.full_name ?? null,
        student_hebrew_name: student?.hebrew_name ?? null,
        role,
        provider_name: provider?.full_name ?? null,
        provider_hebrew_name: provider?.hebrew_name ?? null,
      }
    }

    // Дедуп по id: provider wins. Кладём свои, участник добавляется, если id новый.
    const byId = new Map<string, ReturnType<typeof mapRow>>()
    for (const r of providerRows) byId.set(r.id, mapRow(r, 'provider'))
    for (const r of participantRows) {
      if (!byId.has(r.id)) byId.set(r.id, mapRow(r, 'participant'))
    }

    const appointments = [...byId.values()].sort((a, b) =>
      a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0,
    )

    return NextResponse.json({ appointments })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
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
      return apiError('title_field_required', 400)
    }
    if (!isIsoDateTime(body.starts_at) || !isIsoDateTime(body.ends_at)) {
      return apiError('starts_ends_at_iso', 400)
    }
    if (Date.parse(body.ends_at) <= Date.parse(body.starts_at)) {
      return apiError('ends_after_starts', 400)
    }

    const sb = createServerClient()

    // Защита от двойного бронирования: 409 при пересечении со СВОЕЙ scheduled.
    const overlap = await hasOverlappingAppointment(sb, session.person_id, body.starts_at, body.ends_at)
    if (overlap) {
      return apiError('meeting_overlap', 409)
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
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
