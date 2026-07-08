import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { pageAll } from '@/lib/reports/paging'
import { sponsorsSummary } from '@/lib/reports/summaries'

/**
 * GET /api/reports/sponsors — READ-ONLY.
 *
 * Сводка по спонсорам: число доноров и суммы пожертвований received / pledged
 * (reuse sponsors/donations, суммы в копейках). Право: reports.view.
 *
 * Корректность: число доноров — точный HEAD-COUNT. Пожертвования читаются
 * ПОСТРАНИЧНО и суммируются в копейках — единичный select обрезался бы на
 * db-max-rows и занижал суммы.
 *
 * Ответ: { sponsor_count, total_received, total_pledged }.
 */
export async function GET() {
  try {
    await requireReportsPrivilege('view')
    const sb = createServerClient()

    const { count: sponsorCount, error: cErr } = await sb
      .from('sponsors')
      .select('id', { count: 'exact', head: true })
    if (cErr) throw cErr

    const donations = await pageAll<{ amount: number | string; status: string }>(
      (from, to) =>
        sb
          .from('donations')
          .select('amount, status')
          .order('id', { ascending: true })
          .range(from, to),
    )

    return NextResponse.json(sponsorsSummary(donations, sponsorCount ?? 0))
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
