import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { pageAll } from '@/lib/reports/paging'
import { studentStatusSummary } from '@/lib/reports/summaries'

/**
 * GET /api/reports/students — READ-ONLY.
 *
 * Сводка по education_journeys: всего journey и разбивка по education_status
 * (lead / applicant / student / on_leave / graduated / expelled / alumni / lost).
 * Право: reports.view.
 *
 * Корректность: education_journeys читается ПОСТРАНИЧНО (pageAll) — единичный
 * select обрезался бы на db-max-rows (~1000) и дал бы неверную разбивку.
 *
 * Ответ: { total, by_status }.
 */
export async function GET() {
  try {
    await requireReportsPrivilege('view')
    const sb = createServerClient()

    const journeys = await pageAll<{ education_status: string }>((from, to) =>
      sb
        .from('education_journeys')
        .select('education_status')
        .order('id', { ascending: true })
        .range(from, to),
    )

    return NextResponse.json(studentStatusSummary(journeys))
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
