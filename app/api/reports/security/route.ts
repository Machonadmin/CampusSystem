import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { pageAll } from '@/lib/reports/paging'
import { securitySummary } from '@/lib/reports/summaries'

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
    const sb = createServerClient()

    const incidents = await pageAll<{ status: string; severity: string }>(
      (from, to) =>
        sb
          .from('security_incidents')
          .select('status, severity')
          .order('id', { ascending: true })
          .range(from, to),
    )

    return NextResponse.json(securitySummary(incidents))
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
