import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { mapDbError } from '@/lib/calendar/http'
import { isIsoDate, isIsoDateTime } from '@/lib/calendar/validation'
import { hasOverlappingAppointment } from '@/lib/calendar/overlap'
import { isAboveInHierarchy } from '@/lib/org/hierarchy'
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

    // 3) Встречи, где я — приглашённый участник (appointment_attendees). Деплой-
    // безопасно: нет таблицы → пусто, поведение как раньше.
    let attendeeRows: GetRow[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const myAtt = await (sb as any).from('appointment_attendees').select('appointment_id').eq('person_id', session.person_id)
    if (!myAtt.error && myAtt.data) {
      const ids = Array.from(new Set((myAtt.data as Array<{ appointment_id: string }>).map(r => r.appointment_id)))
      if (ids.length > 0) {
        let q = sb.from('appointments').select(GET_SELECT).in('id', ids).order('starts_at', { ascending: true })
        if (from) q = q.gte('starts_at', `${from}T00:00:00`)
        if (to) q = q.lte('starts_at', `${to}T23:59:59.999`)
        const { data } = await q
        attendeeRows = (data ?? []) as unknown as GetRow[]
      }
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
    for (const r of attendeeRows) {
      if (!byId.has(r.id)) byId.set(r.id, mapRow(r, 'participant'))
    }

    // Список приглашённых участников (persons) + мой статус участия — деплой-
    // безопасно (нет таблицы → пусто).
    const allIds = [...byId.keys()]
    const attendeesByAppt = new Map<string, Array<{ person_id: string; name: string | null; status: string }>>()
    const myStatusByAppt = new Map<string, string>()
    if (allIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attRes = await (sb as any).from('appointment_attendees').select('appointment_id, person_id, status').in('appointment_id', allIds)
      if (!attRes.error && attRes.data) {
        const rows = attRes.data as Array<{ appointment_id: string; person_id: string; status: string }>
        const pids = [...new Set(rows.map(r => r.person_id))]
        const nameById = new Map<string, string | null>()
        if (pids.length > 0) {
          const { data: persons } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', pids)
          for (const p of (persons ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
            nameById.set(p.id, p.full_name ?? p.hebrew_name ?? null)
          }
        }
        for (const a of rows) {
          const arr = attendeesByAppt.get(a.appointment_id) ?? []
          arr.push({ person_id: a.person_id, name: nameById.get(a.person_id) ?? null, status: a.status })
          attendeesByAppt.set(a.appointment_id, arr)
          if (a.person_id === session.person_id) myStatusByAppt.set(a.appointment_id, a.status)
        }
      }
    }

    const appointments = [...byId.values()]
      .map(a => ({ ...a, attendees: attendeesByAppt.get(a.id) ?? [], my_attendance_status: myStatusByAppt.get(a.id) ?? null }))
      .sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0))

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
      attendee_person_ids?: string[]
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

    // Участники: можно пригласить ЛЮБОГО человека. Кто ВЫШЕ создателя по
    // иерархии — его участие требует подтверждения (pending_approval). Деплой-
    // безопасно: если таблицы ещё нет (42P01) — встреча всё равно создана.
    const appointmentId = (data as { id: string }).id
    const attendeeIds = Array.from(new Set((body.attendee_person_ids ?? [])
      .map(x => (x ?? '').trim()).filter(Boolean).filter(id => id !== session.person_id)))
    let pendingApprovalCount = 0
    if (attendeeIds.length > 0) {
      const rows: Array<Record<string, unknown>> = []
      for (const pid of attendeeIds) {
        const above = await isAboveInHierarchy(pid, session.person_id)
        if (above) pendingApprovalCount++
        rows.push({
          appointment_id: appointmentId,
          person_id: pid,
          requires_approval: above,
          status: above ? 'pending_approval' : 'invited',
        })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: aErr } = await (sb as any).from('appointment_attendees').insert(rows)
      void aErr // 42P01 / прочее — не фатально: встреча создана
    }

    return NextResponse.json({ ...(data as object), pending_approval_count: pendingApprovalCount }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
