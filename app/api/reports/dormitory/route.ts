import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { pageAll } from '@/lib/reports/paging'
import { isActiveOn, type Assignment } from '@/lib/dormitory/occupancy'
import { occupancySummary } from '@/lib/reports/summaries'

/**
 * GET /api/reports/dormitory — READ-ONLY.
 *
 * Занятость общежития на СЕГОДНЯ:
 *   capacity = Σ(dorm_rooms.capacity) по всем комнатам,
 *   occupied = число dorm_assignments, активных на сегодня (reuse isActiveOn:
 *              status='active' И сегодня в диапазоне [assigned_from, assigned_to]),
 *   плюс building_count / room_count.
 * Право: reports.view.
 *
 * Корректность: комнаты и назначения читаются ПОСТРАНИЧНО (сумма ёмкости и
 * подсчёт занятости по строкам обрезались бы на db-max-rows). Число зданий —
 * точный HEAD-COUNT (Prefer count=exact), без выборки строк.
 *
 * Ответ: { capacity, occupied, free, occupancy_percent, building_count, room_count }.
 */
export async function GET() {
  try {
    await requireReportsPrivilege('view')
    const sb = createServerClient()

    // Комнаты: ёмкость (сумма) + их число — за один постраничный проход.
    const rooms = await pageAll<{ capacity: number }>((from, to) =>
      sb.from('dorm_rooms').select('capacity').order('id', { ascending: true }).range(from, to),
    )
    const totalCapacity = rooms.reduce((s, r) => s + (r.capacity ?? 0), 0)
    const roomCount = rooms.length

    // Число зданий — точный COUNT (HEAD, без строк).
    const { count: buildingCount, error: bErr } = await sb
      .from('dorm_buildings')
      .select('id', { count: 'exact', head: true })
    if (bErr) throw bErr

    // Занятость на сегодня по строкам назначений (reuse dormitory isActiveOn).
    const today = new Date().toISOString().slice(0, 10)
    const assignments = await pageAll<Assignment>((from, to) =>
      sb
        .from('dorm_assignments')
        .select('assigned_from, assigned_to, status')
        .order('id', { ascending: true })
        .range(from, to),
    )
    const occupied = assignments.filter(a => isActiveOn(a, today)).length

    return NextResponse.json({
      ...occupancySummary(totalCapacity, occupied),
      building_count: buildingCount ?? 0,
      room_count: roomCount,
    })
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
