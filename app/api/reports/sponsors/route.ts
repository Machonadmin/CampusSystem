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
const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  try {
    await requireReportsPrivilege('view')
    const sb = createServerClient()

    // Опциональный период по дате пожертвования (donation_date). Число доноров —
    // всегда текущее (head-count), суммы received/pledged — за период (или всё время).
    const params = new URL(request.url).searchParams
    const dFrom = params.get('from')?.trim()
    const dTo = params.get('to')?.trim()
    const from = dFrom && ISO.test(dFrom) ? dFrom : null
    const to = dTo && ISO.test(dTo) ? dTo : null

    const { count: sponsorCount, error: cErr } = await sb
      .from('sponsors')
      .select('id', { count: 'exact', head: true })
    if (cErr) throw cErr

    const donations = await pageAll<{ amount: number | string; status: string }>(
      (pFrom, pTo) => {
        let q = sb.from('donations').select('amount, status')
        if (from) q = q.gte('donation_date', from)
        if (to) q = q.lte('donation_date', to)
        return q.order('id', { ascending: true }).range(pFrom, pTo)
      },
    )

    return NextResponse.json(sponsorsSummary(donations, sponsorCount ?? 0))
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
