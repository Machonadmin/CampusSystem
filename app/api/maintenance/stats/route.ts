import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireMaintenancePrivilege } from '@/lib/maintenance/permissions'
import { mapDbError } from '@/lib/maintenance/http'
import { loadMaintenanceTicketStats } from '@/lib/reports/metrics'
import { errorResponse } from '@/lib/api/handler'

/**
 * GET /api/maintenance/stats — сводка для верхней панели: число заявок по
 * каждому статусу + общее число просроченных (открытых/в работе с превышением
 * SLA). Читается постранично (без N+1). Право: maintenance.view.
 */

export async function GET() {
  try {
    await requireMaintenancePrivilege('view')

    const sb = createServerClient()

    // ЕДИНЫЙ источник с «דוחות» (/api/reports/maintenance):
    // lib/reports/metrics.loadMaintenanceTicketStats — total_overdue здесь и
    // overdue там считаются одним и тем же isOverdue по одним строкам.
    const { status_counts, total_overdue, total } = await loadMaintenanceTicketStats(sb)

    return NextResponse.json({ status_counts, total_overdue, total })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return errorResponse(m)
    }
    return errorResponse(e)
  }
}
