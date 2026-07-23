import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { pageAll } from '@/lib/reports/paging'
import { toCents } from '@/lib/finance/money'
import { financeSummary } from '@/lib/reports/summaries'

/**
 * GET /api/reports/finance — READ-ONLY.
 *
 * Финансовая сводка по правилу баланса:
 *   charged   = Σ(finance_charges.amount  WHERE status='active')
 *   collected = Σ(finance_payments.amount WHERE status='approved')
 *   debtor_count = число journey, у которых (активные начисления − подтверждённые
 *                  платежи) > 0.
 * Право: reports.view.
 *
 * Корректность: суммы считаются в ЦЕЛЫХ КОПЕЙКАХ (toCents), строки читаются
 * ПОСТРАНИЧНО (pageAll) — каждая строка = отдельное начисление/платёж, единичный
 * select обрезался бы на db-max-rows и дал бы неверные итоги и число должников.
 *
 * Ответ: { charged, collected, outstanding, collection_rate, debtor_count }.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  try {
    await requireReportsPrivilege('view')
    const sb = createServerClient()

    // Опциональный период: charged — по дате создания начисления (created_at),
    // collected — по дате платежа (paid_at). Без from/to — за всё время.
    const params = new URL(request.url).searchParams
    const dFrom = params.get('from')?.trim()
    const dTo = params.get('to')?.trim()
    const from = dFrom && ISO.test(dFrom) ? dFrom : null
    const to = dTo && ISO.test(dTo) ? dTo : null

    const chargeRows = await pageAll<{ journey_id: string; amount: number | string }>((pFrom, pTo) => {
      let q = sb.from('finance_charges').select('journey_id, amount').eq('status', 'active')
      if (from) q = q.gte('created_at', from)
      if (to) q = q.lte('created_at', `${to}T23:59:59.999`)
      return q.order('id', { ascending: true }).range(pFrom, pTo)
    })
    const payRows = await pageAll<{ journey_id: string; amount: number | string }>((pFrom, pTo) => {
      let q = sb.from('finance_payments').select('journey_id, amount').eq('status', 'approved')
      if (from) q = q.gte('paid_at', from)
      if (to) q = q.lte('paid_at', to)
      return q.order('id', { ascending: true }).range(pFrom, pTo)
    })

    let chargesActiveCents = 0
    const chargeByJourney = new Map<string, number>()
    for (const r of chargeRows) {
      const c = toCents(r.amount)
      chargesActiveCents += c
      chargeByJourney.set(r.journey_id, (chargeByJourney.get(r.journey_id) ?? 0) + c)
    }

    let paymentsApprovedCents = 0
    const payByJourney = new Map<string, number>()
    for (const r of payRows) {
      const c = toCents(r.amount)
      paymentsApprovedCents += c
      payByJourney.set(r.journey_id, (payByJourney.get(r.journey_id) ?? 0) + c)
    }

    // Должник = journey с положительным балансом (начислено активно > оплачено).
    let debtorCount = 0
    const journeyIds = new Set<string>([...chargeByJourney.keys(), ...payByJourney.keys()])
    for (const jid of journeyIds) {
      const balance = (chargeByJourney.get(jid) ?? 0) - (payByJourney.get(jid) ?? 0)
      if (balance > 0) debtorCount++
    }

    return NextResponse.json(
      financeSummary(chargesActiveCents, paymentsApprovedCents, debtorCount),
    )
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
