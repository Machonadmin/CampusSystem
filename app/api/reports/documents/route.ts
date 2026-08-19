import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { pageAll } from '@/lib/reports/paging'
import { documentsSummary } from '@/lib/reports/summaries'

/**
 * GET /api/reports/documents — READ-ONLY.
 *
 * Сводка реестра документов: всего / активных, сколько просрочено и сколько
 * истекает скоро (reuse documents/expiry). Право: reports.view.
 *
 * Корректность: строки читаются ПОСТРАНИЧНО (expiry_date, status, doc_type) —
 * подсчёт по строкам обрезался бы на db-max-rows. «Сегодня» — ДАТА 'YYYY-MM-DD'
 * (сравнение дат), поэтому передаётся date, а не полный таймстамп.
 *
 * Ответ: { total, active, expired, expiring_soon }.
 */
export async function GET() {
  try {
    await requireReportsPrivilege('view')
    const sb = createServerClient()

    const todayISO = new Date().toISOString().slice(0, 10)
    const docs = await pageAll<{ expiry_date: string | null; status: string; doc_type: string }>(
      (from, to) =>
        sb
          .from('document_records')
          .select('expiry_date, status, doc_type')
          .order('id', { ascending: true })
          .range(from, to),
    )

    return NextResponse.json(documentsSummary(docs, todayISO))
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
