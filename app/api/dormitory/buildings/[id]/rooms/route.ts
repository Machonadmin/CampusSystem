import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireDormitoryPrivilege } from '@/lib/dormitory/permissions'
import { mapDbError } from '@/lib/dormitory/http'
import { occupancy } from '@/lib/dormitory/occupancy'
import { activeAssignmentsByRoom, todayISO } from '@/lib/dormitory/occupancy-server'
import type { DormRoomInsert } from '@/types/database'

/**
 * GET  /api/dormitory/buildings/[id]/rooms — комнаты здания + занятость сегодня.
 *   Право: dormitory.view.
 * POST /api/dormitory/buildings/[id]/rooms — создать комнату. Право: manage.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDormitoryPrivilege('view')

    const sb = createServerClient()

    const { data: building, error: bErr } = await sb
      .from('dorm_buildings')
      .select('id, name, code, gender')
      .eq('id', params.id)
      .maybeSingle()
    if (bErr) throw bErr
    if (!building) return apiError('building_not_found', 404)

    const { data: rooms, error } = await sb
      .from('dorm_rooms')
      .select('id, building_id, room_number, floor, capacity, notes, is_active, created_at, updated_at')
      .eq('building_id', params.id)
      .order('room_number', { ascending: true })
    if (error) throw error

    const roomRows = rooms ?? []
    const today = todayISO()
    const asgByRoom = await activeAssignmentsByRoom(sb, roomRows.map(r => r.id))

    const result = roomRows.map(r => {
      const occ = occupancy(asgByRoom.get(r.id) ?? [], r.capacity, today)
      return { ...r, occupied: occ.occupied, free: occ.free, is_full: occ.isFull }
    })

    return NextResponse.json({ building, rooms: result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDormitoryPrivilege('manage')

    const body = await request.json() as {
      room_number?: string
      floor?: number | null
      capacity?: number
      notes?: string | null
    }

    const roomNumber = body.room_number?.trim()
    if (!roomNumber) return apiError('room_number_required', 400)

    const capacity = Number(body.capacity)
    if (!Number.isInteger(capacity) || capacity <= 0) {
      return apiError('capacity_positive_int', 400)
    }

    let floor: number | null = null
    if (body.floor !== undefined && body.floor !== null) {
      const f = Number(body.floor)
      if (!Number.isInteger(f)) return apiError('floor_integer', 400)
      floor = f
    }

    const sb = createServerClient()

    const { data: building, error: bErr } = await sb
      .from('dorm_buildings').select('id').eq('id', params.id).maybeSingle()
    if (bErr) throw bErr
    if (!building) return apiError('building_not_found', 404)

    const insert: DormRoomInsert = {
      building_id: params.id,
      room_number: roomNumber,
      floor,
      capacity,
      notes: body.notes?.trim() || null,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('dorm_rooms')
      .insert(insert as any)
      .select('*')
      .single()
    if (error) {
      const m = mapDbError(error)
      // 23505 → 409: дубль номера комнаты в пределах здания.
      const message = error.code === '23505'
        ? 'Комната с таким номером уже есть в этом здании'
        : m.message
      return NextResponse.json({ error: message }, { status: m.status })
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
