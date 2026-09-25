import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege, requireReportModule } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { loadFinanceTotals } from '@/lib/reports/metrics'

/**
 * GET /api/reports/finance — READ-ONLY.
 *
 * Финансовая сводка по правилу баланса (то же, что в ledger-роуте):
 *   charged   = Σ(finance_charges.amount    WHERE status='active')
 *   discounts = Σ(finance_discounts.amount по этим активным счетам)
 *   collected = Σ(finance_payments.amount   WHERE status='approved')
 *   outstanding  = charged − discounts − collected
 *   debtor_count = число journey, у которых (начислено − скидки − оплачено) > 0.
 * Право: reports.view.
 *
 * Корректность: суммы считаются в ЦЕЛЫХ КОПЕЙКАХ (toCents), строки читаются
 * ПОСТРАНИЧНО (pageAll) — каждая строка = отдельное начисление/платёж, единичный
 * select обрезался бы на db-max-rows и дал бы неверные итоги и число должников.
 *
 * Ответ: { charged, discounts, collected, outstanding, collection_rate, debtor_count }.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  try {
    await requireReportsPrivilege('view')
    await requireReportModule('finance')
    const sb = createServerClient()

    // Опциональный период: charged — по дате создания начисления (created_at),
    // collected — по дате платежа (paid_at). Без from/to — за всё время.
    const params = new URL(request.url).searchParams
    const dFrom = params.get('from')?.trim()
    const dTo = params.get('to')?.trim()
    const from = dFrom && ISO.test(dFrom) ? dFrom : null
    const to = dTo && ISO.test(dTo) ? dTo : null

    // Единый источник (lib/reports/metrics.ts): тот же загрузчик считает
    // сводку сбора в модуле финансов (/api/finance/students → summary).
    const { summary } = await loadFinanceTotals(sb, { from, to })
    return NextResponse.json(summary)
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
