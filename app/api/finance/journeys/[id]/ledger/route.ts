import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege } from '@/lib/finance/permissions'
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
    await requireFinancePrivilege('view')

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
    if (!journey) return NextResponse.json({ error: 'Студент не найден' }, { status: 404 })

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
      created_at: string; updated_at: string
    }
    const paymentRows: PaymentRow[] = []
    let pFrom = 0
    for (;;) {
      const { data, error } = await sb
        .from('finance_payments')
        .select('id, journey_id, amount, paid_at, method, reference, status, recorded_by, approved_by, approved_at, created_at, updated_at')
        .eq('journey_id', params.id)
        .order('paid_at', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(pFrom, pFrom + PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as PaymentRow[]
      paymentRows.push(...page)
      if (page.length < PAGE) break
      pFrom += PAGE
    }

    return NextResponse.json({
      journey,
      charges: chargeRows,
      payments: paymentRows,
      totals: computeLedgerTotals(chargeRows, paymentRows),
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
