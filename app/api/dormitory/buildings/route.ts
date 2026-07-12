import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireDormitoryPrivilege } from '@/lib/dormitory/permissions'
import { mapDbError } from '@/lib/dormitory/http'
import { occupancy } from '@/lib/dormitory/occupancy'
import { roomsOfBuildings, activeAssignmentsByRoom, todayISO } from '@/lib/dormitory/occupancy-server'
import type { DormBuildingInsert } from '@/types/database'

/**
 * GET  /api/dormitory/buildings — здания + сводка занятости на сегодня
 *   (кол-во комнат, суммарная вместимость, занято, свободно). Занятость
 *   считается пакетно (без N+1) через чистые occupancy-хелперы.
 *   Право: dormitory.view.
 * POST /api/dormitory/buildings — создать здание. Право: dormitory.manage.
 */

const GENDERS = ['male', 'female', 'mixed'] as const

export async function GET() {
  try {
    await requireDormitoryPrivilege('view')

    const sb = createServerClient()
    const today = todayISO()

    const { data: buildings, error } = await sb
      .from('dorm_buildings')
      .select('id, name, code, gender, address, notes, is_active, created_at, updated_at')
      .order('name', { ascending: true })
    if (error) throw error

    const rows = buildings ?? []
    const buildingIds = rows.map(b => b.id)

    const rooms = await roomsOfBuildings(sb, buildingIds)
    const roomIds = rooms.map(r => r.id)
    const asgByRoom = await activeAssignmentsByRoom(sb, roomIds)

    // Агрегация по зданию: комнаты, вместимость, занято (на сегодня).
    const agg = new Map<string, { rooms_count: number; total_capacity: number; occupied: number }>()
    for (const b of rows) agg.set(b.id, { rooms_count: 0, total_capacity: 0, occupied: 0 })
    for (const r of rooms) {
      const a = agg.get(r.building_id)
      if (!a) continue
      a.rooms_count += 1
      a.total_capacity += r.capacity
      a.occupied += occupancy(asgByRoom.get(r.id) ?? [], r.capacity, today).occupied
    }

    const result = rows.map(b => {
      const a = agg.get(b.id) ?? { rooms_count: 0, total_capacity: 0, occupied: 0 }
      const free = Math.max(0, a.total_capacity - a.occupied)
      return { ...b, rooms_count: a.rooms_count, total_capacity: a.total_capacity, occupied: a.occupied, free }
    })

    return NextResponse.json({ buildings: result })
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
    await requireDormitoryPrivilege('manage')

    const body = await request.json() as {
      name?: string
      code?: string | null
      gender?: string
      address?: string | null
      notes?: string | null
    }

    const name = body.name?.trim()
    if (!name) return apiError('name_field_required', 400)

    let gender: 'male' | 'female' | 'mixed' = 'mixed'
    if (body.gender !== undefined && body.gender !== null) {
      if (!(GENDERS as readonly string[]).includes(body.gender)) {
        return apiError('gender_enum', 400)
      }
      gender = body.gender as 'male' | 'female' | 'mixed'
    }

    const insert: DormBuildingInsert = {
      name,
      code: body.code?.trim() || null,
      gender,
      address: body.address?.trim() || null,
      notes: body.notes?.trim() || null,
    }

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('dorm_buildings')
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
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
