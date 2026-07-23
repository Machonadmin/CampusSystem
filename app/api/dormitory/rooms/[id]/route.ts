import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireDormitoryPrivilege } from '@/lib/dormitory/permissions'
import { mapDbError } from '@/lib/dormitory/http'
import { occupancy } from '@/lib/dormitory/occupancy'
import { activeAssignmentsByRoom, todayISO } from '@/lib/dormitory/occupancy-server'
import type { DormRoomUpdate } from '@/types/database'

/**
 * GET    /api/dormitory/rooms/[id] — комната + занятость сегодня + здание (view)
 * PATCH  /api/dormitory/rooms/[id] — правка комнаты (manage)
 * DELETE /api/dormitory/rooms/[id] — удаление, каскадом назначения (manage)
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDormitoryPrivilege('view')

    const sb = createServerClient()

    const { data: room, error } = await sb
      .from('dorm_rooms')
      .select(`
        id, building_id, room_number, floor, capacity, notes, is_active, created_at, updated_at,
        building:dorm_buildings!dorm_rooms_building_id_fkey(id, name, code, gender)
      `)
      .eq('id', params.id)
      .maybeSingle()
    if (error) throw error
    if (!room) return apiError('room_not_found', 404)

    const today = todayISO()
    const asgByRoom = await activeAssignmentsByRoom(sb, [params.id])
    const occ = occupancy(asgByRoom.get(params.id) ?? [], room.capacity, today)

    return NextResponse.json({ ...room, occupied: occ.occupied, free: occ.free, is_full: occ.isFull })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PATCH(
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
      is_active?: boolean
    }

    const update: DormRoomUpdate = {}
    if (body.room_number !== undefined) {
      const n = body.room_number?.trim()
      if (!n) return apiError('room_number_not_empty', 400)
      update.room_number = n
    }
    if (body.capacity !== undefined) {
      const c = Number(body.capacity)
      if (!Number.isInteger(c) || c <= 0) {
        return apiError('capacity_positive_int', 400)
      }
      update.capacity = c
    }
    if (body.floor !== undefined) {
      if (body.floor === null) update.floor = null
      else {
        const f = Number(body.floor)
        if (!Number.isInteger(f)) return apiError('floor_integer', 400)
        update.floor = f
      }
    }
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null
    if (body.is_active !== undefined) update.is_active = !!body.is_active

    if (Object.keys(update).length === 0) {
      return apiError('no_changes', 400)
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('dorm_rooms').select('id').eq('id', params.id).maybeSingle()
    if (exErr) throw exErr
    if (!existing) return apiError('room_not_found', 404)

    const { data, error } = await sb
      .from('dorm_rooms')
      .update(update)
      .eq('id', params.id)
      .select('*')
      .single()
    if (error) {
      const m = mapDbError(error)
      const message = error.code === '23505'
        ? 'Комната с таким номером уже есть в этом здании'
        : m.message
      return NextResponse.json({ error: message }, { status: m.status })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDormitoryPrivilege('manage')

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('dorm_rooms').select('id').eq('id', params.id).maybeSingle()
    if (exErr) throw exErr
    if (!existing) return apiError('room_not_found', 404)

    const { error } = await sb.from('dorm_rooms').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
