import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege, requireReportModule } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { loadOccupancy } from '@/lib/reports/metrics'

/**
 * GET /api/reports/dormitory — READ-ONLY.
 *
 * Занятость общежития на СЕГОДНЯ:
 *   capacity = Σ(dorm_rooms.capacity) по комнатам существующих зданий,
 *   occupied = число dorm_assignments этих комнат, активных на сегодня (reuse
 *              isActiveOn: status='active' И сегодня в [assigned_from, assigned_to]),
 *   считается lib/reports/metrics.loadOccupancy — тем же, что /api/dormitory/buildings,
 *   плюс building_count / room_count.
 * Право: reports.view.
 *
 * Корректность: комнаты и назначения читаются ПОСТРАНИЧНО (сумма ёмкости и
 * подсчёт занятости по строкам обрезались бы на db-max-rows). Число зданий —
 * число прочитанных (постранично) зданий.
 *
 * Ответ: { capacity, occupied, free, occupancy_percent, building_count, room_count }.
 */
export async function GET() {
  try {
    await requireReportsPrivilege('view')
    await requireReportModule('dormitory')
    const sb = createServerClient()

    // ЕДИНЫЙ источник с модулем (/api/dormitory/buildings): loadOccupancy.
    // Итог = сумма по зданиям (комнаты без существующего здания не считаются).
    const { total } = await loadOccupancy(sb)
    return NextResponse.json(total)
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
