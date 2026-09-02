import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasFinancePrivilege } from '@/lib/finance/permissions'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { computeLedgerTotals } from '@/lib/finance/money'
import { isJourneyOverdue } from '@/lib/finance/overdue'
import { todayISO } from '@/lib/dates'
import { jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * POST /api/finance/overdue-alerts/sync — просроченный платёж → student_alert
 * type 'financial_debt' (spec §3.9). Идемпотентно: не создаёт дубль, если по
 * персоне уже есть ОТКРЫТОЕ (state<>'closed') финансовое оповещение. Баланс
 * считается тем же computeLedgerTotals, что и в леджере.
 *
 * Право: manage_alerts (Chana может обновить свои оповещения) ИЛИ finance.view.
 * Deploy-safe: нет student_alerts → 503; нет finance-таблиц → 0.
 */
export async function POST(_request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = (await hasEducationPrivilege(session, 'manage_alerts'))
      || (await hasFinancePrivilege(session, 'view'))
    if (!allowed) return apiError('forbidden', 403)

    const sb = createServerClient()
    const today = todayISO()

    // Активные начисления.
    const { data: chargesRaw, error: cErr } = await sb
      .from('finance_charges').select('id, journey_id, amount, status, due_date')
    if (cErr) { if (cErr.code === '42P01') return NextResponse.json({ created: 0, overdue: 0 }); throw cErr }
    const charges = (chargesRaw ?? []) as Array<{ id: string; journey_id: string; amount: number | string; status: string; due_date: string | null }>
    if (charges.length === 0) return NextResponse.json({ created: 0, overdue: 0 })

    const journeyIds = [...new Set(charges.map(c => c.journey_id))]
    const chargeToJourney = new Map(charges.map(c => [c.id, c.journey_id]))

    // Оплаты.
    const { data: paysRaw } = await sb.from('finance_payments').select('journey_id, amount, status').in('journey_id', journeyIds)
    const pays = (paysRaw ?? []) as Array<{ journey_id: string; amount: number | string; status: string }>

    // Скидки (по charge → journey). Deploy-safe.
    const discByJourney = new Map<string, Array<{ amount: number | string }>>()
    try {
      const { data: discRaw, error: dErr } = await sb.from('finance_discounts').select('charge_id, amount').in('charge_id', charges.map(c => c.id))
      if (dErr) throw dErr
      for (const d of (discRaw ?? []) as Array<{ charge_id: string; amount: number | string }>) {
        const jid = chargeToJourney.get(d.charge_id); if (!jid) continue
        const arr = discByJourney.get(jid) ?? []; arr.push({ amount: d.amount }); discByJourney.set(jid, arr)
      }
    } catch (e) { if ((e as { code?: string }).code !== '42P01') throw e }

    const chargesByJourney = new Map<string, typeof charges>()
    for (const c of charges) { const a = chargesByJourney.get(c.journey_id) ?? []; a.push(c); chargesByJourney.set(c.journey_id, a) }
    const paysByJourney = new Map<string, typeof pays>()
    for (const p of pays) { const a = paysByJourney.get(p.journey_id) ?? []; a.push(p); paysByJourney.set(p.journey_id, a) }

    // Просроченные journey.
    const overdueJourneys = journeyIds.filter(jid => {
      const jc = chargesByJourney.get(jid) ?? []
      const totals = computeLedgerTotals(jc, paysByJourney.get(jid) ?? [], discByJourney.get(jid) ?? [])
      return isJourneyOverdue(totals.balance, jc, today)
    })
    if (overdueJourneys.length === 0) return NextResponse.json({ created: 0, overdue: 0 })

    // person_id по journey.
    const { data: jrRaw } = await sb.from('education_journeys').select('id, person_id').in('id', overdueJourneys)
    const personByJourney = new Map<string, string>()
    for (const r of (jrRaw ?? []) as Array<{ id: string; person_id: string | null }>) if (r.person_id) personByJourney.set(r.id, r.person_id)
    const personIds = [...new Set([...personByJourney.values()])]
    if (personIds.length === 0) return NextResponse.json({ created: 0, overdue: overdueJourneys.length })

    // Дедуп: у кого уже есть открытое financial_debt.
    const hasOpen = new Set<string>()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing, error } = await (sb.from('student_alerts') as any)
        .select('student_id').eq('type_code', 'financial_debt').neq('state', 'closed').in('student_id', personIds)
      if (error) { if (error.code === '42P01') return apiError('feature_not_migrated', 503); throw error }
      for (const r of (existing ?? []) as Array<{ student_id: string }>) hasOpen.add(r.student_id)
    } catch (e) { if ((e as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503); throw e }

    const toCreate = personIds.filter(pid => !hasOpen.has(pid))
      .map(pid => ({ student_id: pid, type_code: 'financial_debt', severity: 'warning', source_module: 'finance', state: 'new', reported_by: session.person_id, is_sensitive: false }))
    if (toCreate.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (sb.from('student_alerts') as any).insert(toCreate)
      if (error) throw error
    }
    return NextResponse.json({ created: toCreate.length, overdue: overdueJourneys.length })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
