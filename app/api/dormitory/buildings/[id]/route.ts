import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireDormitoryPrivilege } from '@/lib/dormitory/permissions'
import { mapDbError } from '@/lib/dormitory/http'
import { occupancy } from '@/lib/dormitory/occupancy'
import { roomsOfBuildings, activeAssignmentsByRoom, todayISO } from '@/lib/dormitory/occupancy-server'
import type { DormBuildingUpdate } from '@/types/database'

/**
 * GET    /api/dormitory/buildings/[id] — здание + сводка занятости (view)
 * PATCH  /api/dormitory/buildings/[id] — правка здания (manage)
 * DELETE /api/dormitory/buildings/[id] — удаление, каскадом комнаты+назначения (manage)
 */

const GENDERS = ['male', 'female', 'mixed'] as const

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDormitoryPrivilege('view')

    const sb = createServerClient()

    const { data: building, error } = await sb
      .from('dorm_buildings')
      .select('id, name, code, gender, address, notes, is_active, created_at, updated_at')
      .eq('id', params.id)
      .maybeSingle()
    if (error) throw error
    if (!building) return NextResponse.json({ error: 'Здание не найдено' }, { status: 404 })

    const today = todayISO()
    const rooms = await roomsOfBuildings(sb, [params.id])
    const asgByRoom = await activeAssignmentsByRoom(sb, rooms.map(r => r.id))
    let total_capacity = 0, occupied = 0
    for (const r of rooms) {
      total_capacity += r.capacity
      occupied += occupancy(asgByRoom.get(r.id) ?? [], r.capacity, today).occupied
    }

    return NextResponse.json({
      ...building,
      rooms_count: rooms.length,
      total_capacity,
      occupied,
      free: Math.max(0, total_capacity - occupied),
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDormitoryPrivilege('manage')

    const body = await request.json() as {
      name?: string
      code?: string | null
      gender?: string
      address?: string | null
      notes?: string | null
      is_active?: boolean
    }

    const update: DormBuildingUpdate = {}
    if (body.name !== undefined) {
      const n = body.name?.trim()
      if (!n) return NextResponse.json({ error: 'name не может быть пустым' }, { status: 400 })
      update.name = n
    }
    if (body.code !== undefined) update.code = body.code?.trim() || null
    if (body.gender !== undefined) {
      if (!(GENDERS as readonly string[]).includes(body.gender)) {
        return NextResponse.json({ error: "gender должен быть 'male', 'female' или 'mixed'" }, { status: 400 })
      }
      update.gender = body.gender as 'male' | 'female' | 'mixed'
    }
    if (body.address !== undefined) update.address = body.address?.trim() || null
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null
    if (body.is_active !== undefined) update.is_active = !!body.is_active

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('dorm_buildings').select('id').eq('id', params.id).maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'Здание не найдено' }, { status: 404 })

    const { data, error } = await sb
      .from('dorm_buildings')
      .update(update)
      .eq('id', params.id)
      .select('*')
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
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
      .from('dorm_buildings').select('id').eq('id', params.id).maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'Здание не найдено' }, { status: 404 })

    const { error } = await sb.from('dorm_buildings').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
