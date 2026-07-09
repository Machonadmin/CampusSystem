import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireDormitoryPrivilege } from '@/lib/dormitory/permissions'
import { mapDbError } from '@/lib/dormitory/http'
import { isIsoDate } from '@/lib/dormitory/validation'
import { canAssign } from '@/lib/dormitory/occupancy'
import { countRoomActiveOverlaps, journeyHasActiveOverlap } from '@/lib/dormitory/occupancy-server'
import type { DormAssignmentInsert } from '@/types/database'

// PostgREST молча обрезает выдачу на db-max-rows (~1000). Назначения комнаты
// читаем постранично; вторичная сортировка по id — стабильная пагинация.
const PAGE = 1000

/**
 * GET  /api/dormitory/rooms/[id]/assignments — назначения комнаты + имя студента.
 *   Право: dormitory.view.
 * POST /api/dormitory/rooms/[id]/assignments — назначить студента (manage).
 *   Проверяет вместимость и отсутствие двойного бронирования студента по датам;
 *   409 при конфликте с понятным сообщением.
 */

function studentName(row: { journey?: unknown }): { journey_id: string | null; full_name: string; hebrew_name: string | null } {
  const j = row.journey as {
    id?: string
    person?: { full_name?: string | null; hebrew_name?: string | null } | null
  } | null
  return {
    journey_id: j?.id ?? null,
    full_name: j?.person?.full_name ?? '',
    hebrew_name: j?.person?.hebrew_name ?? null,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDormitoryPrivilege('view')

    const sb = createServerClient()

    const { data: room, error: rErr } = await sb
      .from('dorm_rooms').select('id, room_number, capacity, building_id').eq('id', params.id).maybeSingle()
    if (rErr) throw rErr
    if (!room) return NextResponse.json({ error: 'Комната не найдена' }, { status: 404 })

    const buildQuery = () => sb
      .from('dorm_assignments')
      .select(`
        id, room_id, journey_id, assigned_from, assigned_to, status, created_at, updated_at,
        journey:education_journeys!dorm_assignments_journey_id_fkey(
          id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)
        )
      `)
      .eq('room_id', params.id)
      .order('assigned_from', { ascending: false })
      .order('id', { ascending: true })

    type AssignmentRow = NonNullable<Awaited<ReturnType<typeof buildQuery>>['data']>[number]
    const data: AssignmentRow[] = []
    let from = 0
    for (;;) {
      const { data: page, error } = await buildQuery().range(from, from + PAGE - 1)
      if (error) throw error
      const rows = (page ?? []) as AssignmentRow[]
      data.push(...rows)
      if (rows.length < PAGE) break
      from += PAGE
    }

    const assignments = data.map(a => {
      const s = studentName(a)
      return {
        id: a.id,
        room_id: a.room_id,
        journey_id: a.journey_id,
        assigned_from: a.assigned_from,
        assigned_to: a.assigned_to,
        status: a.status,
        student_name: s.full_name,
        student_hebrew_name: s.hebrew_name,
      }
    })

    return NextResponse.json({ room, assignments })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireDormitoryPrivilege('manage')

    const body = await request.json() as {
      journey_id?: string
      assigned_from?: string
      assigned_to?: string | null
    }

    const journeyId = body.journey_id?.trim()
    if (!journeyId) return NextResponse.json({ error: 'journey_id обязателен' }, { status: 400 })

    const from = body.assigned_from?.trim()
    if (!from || !isIsoDate(from)) {
      return NextResponse.json({ error: 'assigned_from обязателен и должен быть датой YYYY-MM-DD' }, { status: 400 })
    }
    let to: string | null = null
    if (body.assigned_to !== undefined && body.assigned_to !== null && body.assigned_to !== '') {
      to = body.assigned_to.trim()
      if (!isIsoDate(to)) return NextResponse.json({ error: 'assigned_to должен быть датой YYYY-MM-DD' }, { status: 400 })
      if (to < from) return NextResponse.json({ error: 'assigned_to не может быть раньше assigned_from' }, { status: 400 })
    }

    const sb = createServerClient()

    const { data: room, error: rErr } = await sb
      .from('dorm_rooms').select('id, capacity').eq('id', params.id).maybeSingle()
    if (rErr) throw rErr
    if (!room) return NextResponse.json({ error: 'Комната не найдена' }, { status: 404 })

    const { data: journey, error: jErr } = await sb
      .from('education_journeys').select('id').eq('id', journeyId).maybeSingle()
    if (jErr) throw jErr
    if (!journey) return NextResponse.json({ error: 'Студент не найден' }, { status: 400 })

    // Enforce capacity + no student double-booking over the requested date range.
    const [existingOverlaps, studentOverlap] = await Promise.all([
      countRoomActiveOverlaps(sb, params.id, from, to),
      journeyHasActiveOverlap(sb, journeyId, from, to),
    ])
    const decision = canAssign({
      roomCapacity: room.capacity,
      existingActiveOverlapping: existingOverlaps,
      studentHasActiveOverlap: studentOverlap,
    })
    if (!decision.ok) {
      const message = decision.reason === 'room_full'
        ? 'Комната заполнена на выбранные даты'
        : 'У студента уже есть назначение, пересекающееся по датам'
      return NextResponse.json({ error: message, reason: decision.reason }, { status: 409 })
    }

    const insert: DormAssignmentInsert = {
      room_id: params.id,
      journey_id: journeyId,
      assigned_from: from,
      assigned_to: to,
      status: 'active',
      created_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('dorm_assignments')
      .insert(insert as any)
      .select('*')
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
