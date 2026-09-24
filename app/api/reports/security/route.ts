import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege, requireReportModule } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { loadIncidentStats } from '@/lib/reports/metrics'

/**
 * GET /api/reports/security — READ-ONLY.
 *
 * Сводка по инцидентам безопасности: активные (open+investigating), open и
 * разбивка по серьёзности (reuse security/incidents). Право: reports.view.
 *
 * Корректность: инциденты читаются ПОСТРАНИЧНО (status, severity) — подсчёт по
 * строкам обрезался бы на db-max-rows.
 *
 * Ответ: { active, open, investigating, by_severity }.
 */
export async function GET() {
  try {
    await requireReportsPrivilege('view')
    await requireReportModule('security')
    const sb = createServerClient()

    // ЕДИНЫЙ источник с модулем (/api/security/stats): loadIncidentStats.
    const { active, open, investigating, by_severity } = await loadIncidentStats(sb)
    return NextResponse.json({ active, open, investigating, by_severity })
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
