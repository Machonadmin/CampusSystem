import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { pageAll } from '@/lib/reports/paging'
import { clinicSummary } from '@/lib/reports/summaries'

/**
 * GET /api/reports/clinic — READ-ONLY.
 *
 * Сводка медпункта (reuse doctor/medical visitStats):
 *   open_visits        — открытых приёмов,
 *   upcoming_followups — открытых приёмов с предстоящим контрольным визитом,
 *   overdue_followups  — открытых приёмов с просроченным контролем.
 * Право: reports.view.
 *
 * Корректность: приёмы читаются ПОСТРАНИЧНО (status, follow_up_date) — подсчёт по
 * строкам обрезался бы на db-max-rows. «Сегодня» передаётся параметром (граница
 * follow_up_date == сегодня → предстоящий, не просроченный).
 *
 * Ответ: { open_visits, upcoming_followups, overdue_followups }.
 */
export async function GET() {
  try {
    await requireReportsPrivilege('view')
    const sb = createServerClient()

    const today = new Date().toISOString().slice(0, 10)
    const visits = await pageAll<{ status: string; follow_up_date: string | null }>((from, to) =>
      sb
        .from('medical_visits')
        .select('status, follow_up_date')
        .order('id', { ascending: true })
        .range(from, to),
    )

    return NextResponse.json(clinicSummary(visits, today))
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
