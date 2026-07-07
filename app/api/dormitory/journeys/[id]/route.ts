import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireDormitoryPrivilege } from '@/lib/dormitory/permissions'
import { mapDbError } from '@/lib/dormitory/http'
import { isActiveOn, type Assignment } from '@/lib/dormitory/occupancy'
import { todayISO } from '@/lib/dormitory/occupancy-server'

/**
 * GET /api/dormitory/journeys/[id] — текущее назначение студента + история.
 *   [id] = journey_id. Право: dormitory.view.
 *   Ответ: { current, history[] } — current активно на сегодня (или null).
 */

interface RoomJoin {
  id?: string
  room_number?: string | null
  floor?: number | null
  building?: { id?: string; name?: string | null } | null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDormitoryPrivilege('view')

    const sb = createServerClient()

    const { data, error } = await sb
      .from('dorm_assignments')
      .select(`
        id, room_id, journey_id, assigned_from, assigned_to, status, created_at, updated_at,
        room:dorm_rooms!dorm_assignments_room_id_fkey(
          id, room_number, floor,
          building:dorm_buildings!dorm_rooms_building_id_fkey(id, name)
        )
      `)
      .eq('journey_id', params.id)
      .order('assigned_from', { ascending: false })
    if (error) throw error

    const today = todayISO()
    const rows = (data ?? []).map(a => {
      const room = a.room as RoomJoin | null
      return {
        id: a.id,
        room_id: a.room_id,
        assigned_from: a.assigned_from,
        assigned_to: a.assigned_to,
        status: a.status,
        room_number: room?.room_number ?? null,
        floor: room?.floor ?? null,
        building_name: room?.building?.name ?? null,
      }
    })

    const current = rows.find(r =>
      isActiveOn({ assigned_from: r.assigned_from, assigned_to: r.assigned_to, status: r.status } as Assignment, today)
    ) ?? null

    return NextResponse.json({ current, history: rows })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
