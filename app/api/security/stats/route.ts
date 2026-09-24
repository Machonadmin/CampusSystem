import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireSecurityPrivilege } from '@/lib/security/permissions'
import { mapDbError } from '@/lib/security/http'
import { loadIncidentStats } from '@/lib/reports/metrics'
import { errorResponse } from '@/lib/api/handler'

/**
 * GET /api/security/stats — сводка для верхней панели: число инцидентов по
 * каждому статусу + разбивка по серьёзности + общее число активных (open +
 * investigating). Читается постранично (без N+1). Право: security.view.
 */

export async function GET() {
  try {
    await requireSecurityPrivilege('view')

    const sb = createServerClient()

    // ЕДИНЫЙ источник с «דוחות» (/api/reports/security): loadIncidentStats.
    return NextResponse.json(await loadIncidentStats(sb))
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return errorResponse(m)
    }
    return errorResponse(e)
  }
}
