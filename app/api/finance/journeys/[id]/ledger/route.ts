import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canViewStudentFinance } from '@/lib/finance/access'
import { computeLedgerTotals } from '@/lib/finance/money'
import { mapDbError } from '@/lib/finance/http'

/**
 * GET /api/finance/journeys/[id]/ledger
 *
 * Полный ПНК одного студента: все начисления (active/cancelled) и все платежи
 * (pending/approved/cancelled), плюс итоги. Баланс считается по правилу:
 *   balance = Σ(charges active) − Σ(payments approved)   (в копейках)
 *
 * Право: finance.view.
 *
 * Ответ: { journey, charges[], payments[], totals: {
 *   charges_active, payments_approved, payments_pending, balance } }
 * 404 — если journey не найден.
 */

const PERSON_SELECT =
  'id, full_name, hebrew_name, email, phones, photo_url'

// PostgREST молча обрезает выдачу на db-max-rows (~1000). Начислений/платежей у
// одного студента может быть больше — тогда единый select без .range() дал бы
// НЕВЕРНЫЙ баланс (часть строк потерялась бы). Читаем постранично и суммируем по
// всему набору. Тот же приём, что в app/api/finance/students/route.ts.
const PAGE = 1000

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canViewStudentFinance(session, params.id))) return apiError('forbidden', 403)

    const sb = createServerClient()

    const { data: journey, error: jErr } = await sb
      .from('education_journeys')
      .select(`
        id, person_id, education_status,
        person:persons!applicant_profiles_person_id_fkey(${PERSON_SELECT})
      `)
      .eq('id', params.id)
      .maybeSingle()
    if (jErr) throw jErr
    if (!journey) return apiError('student_not_found', 404)

    // Начисления — постранично (вторичная сортировка по id: стабильная пагинация).
    type ChargeRow = {
      id: string; journey_id: string; amount: number | string; description: string | null
      period_label: string | null; due_date: string | null; status: string
      created_by: string | null; created_at: string; updated_at: string
    }
    const chargeRows: ChargeRow[] = []
    let cFrom = 0
    for (;;) {
      const { data, error } = await sb
        .from('finance_charges')
        .select('id, journey_id, amount, description, period_label, due_date, status, created_by, created_at, updated_at')
        .eq('journey_id', params.id)
        .order('due_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(cFrom, cFrom + PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as ChargeRow[]
      chargeRows.push(...page)
      if (page.length < PAGE) break
      cFrom += PAGE
    }

    // Платежи — постранично (вторичная сортировка по id: стабильная пагинация).
    type PaymentRow = {
      id: string; journey_id: string; amount: number | string; paid_at: string | null
      method: string | null; reference: string | null; status: string
      recorded_by: string | null; approved_by: string | null; approved_at: string | null
      deposited_to?: string | null; from_account?: string | null; to_account?: string | null
      signer_name?: string | null; typed_name?: string | null; signed_at?: string | null
      created_at: string; updated_at: string
    }
    const PAY_BASE = 'id, journey_id, amount, paid_at, method, reference, status, recorded_by, approved_by, approved_at, created_at, updated_at'
    const PAY_FULL = `${PAY_BASE}, deposited_to, from_account, to_account, signer_name, typed_name, signed_at`
    // Деплой-безопасно: до применения миграции новых колонок нет (42703) → базовый набор.
    let payCols = PAY_FULL
    {
      const probe = await sb.from('finance_payments').select(PAY_FULL).limit(1)
      if (probe.error && (probe.error as { code?: string }).code === '42703') payCols = PAY_BASE
    }
    const paymentRows: PaymentRow[] = []
    let pFrom = 0
    for (;;) {
      const { data, error } = await sb
        .from('finance_payments')
        .select(payCols)
        .eq('journey_id', params.id)
        .order('paid_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(pFrom, pFrom + PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as unknown as PaymentRow[]
      paymentRows.push(...page)
      if (page.length < PAGE) break
      pFrom += PAGE
    }

    // Скидки по этим счетам (finance_discounts) — деплой-безопасно к отсутствию
    // таблицы (до применения миграции скидок ещё нет → пусто).
    type DiscountRow = {
      id: string; charge_id: string; percent: number | string; amount: number | string
      reason: string | null; signer_name: string | null; typed_name: string | null
      signed_at: string | null; created_at: string
    }
    const discountsByCharge = new Map<string, DiscountRow[]>()
    const chargeIds = chargeRows.map(c => c.id)
    if (chargeIds.length > 0) {
      try {
        const { data, error } = await (sb as unknown as SupabaseClient)
          .from('finance_discounts')
          .select('id, charge_id, percent, amount, reason, signer_name, typed_name, signed_at, created_at')
          .in('charge_id', chargeIds)
          .order('created_at', { ascending: true })
        if (error) throw error
        for (const d of (data ?? []) as DiscountRow[]) {
          const arr = discountsByCharge.get(d.charge_id) ?? []
          arr.push(d); discountsByCharge.set(d.charge_id, arr)
        }
      } catch (e) {
        if ((e as { code?: string }).code !== '42P01') throw e
      }
    }

    // Скидки только по АКТИВНЫМ счетам идут в баланс.
    const activeChargeIds = new Set(chargeRows.filter(c => c.status === 'active').map(c => c.id))
    const activeDiscounts: { amount: number | string }[] = []
    for (const [chargeId, arr] of discountsByCharge) {
      if (activeChargeIds.has(chargeId)) for (const d of arr) activeDiscounts.push({ amount: d.amount })
    }

    const charges = chargeRows.map(c => ({ ...c, discounts: discountsByCharge.get(c.id) ?? [] }))

    return NextResponse.json({
      journey,
      charges,
      payments: paymentRows,
      totals: computeLedgerTotals(chargeRows, paymentRows, activeDiscounts),
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
