import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege } from '@/lib/finance/permissions'
import { mapDbError } from '@/lib/finance/http'

/**
 * POST /api/finance/payments/[id]/approve
 *
 * Подтвердить платёж: status 'pending' → 'approved', проставить approved_by /
 * approved_at. Только подтверждённые платежи участвуют в балансе.
 * Право: finance.approve_payment.
 *
 * 404 — платёж не найден.
 * 409 — платёж не в статусе 'pending' (уже подтверждён или отменён): недопустимый
 *   переход статуса, как в PATCH payments/[id] (правка подтверждённого — тоже 409).
 */

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireFinancePrivilege('approve_payment')

    const sb = createServerClient()

    const { data: payment, error: pErr } = await sb
      .from('finance_payments')
      .select('id, status')
      .eq('id', params.id)
      .maybeSingle()
    if (pErr) throw pErr
    if (!payment) return apiError('payment_not_found', 404)

    if (payment.status !== 'pending') {
      return NextResponse.json(
        { error: `Подтвердить можно только платёж в статусе 'pending' (текущий: '${payment.status}')` },
        { status: 409 }
      )
    }

    // Условная запись (атомарно, без TOCTOU): подтверждаем ТОЛЬКО если платёж всё
    // ещё 'pending'. Если между проверкой выше и записью статус сменился
    // (параллельный approve/cancel) — 0 строк → 409, а не двойное подтверждение.
    const { data, error } = await sb
      .from('finance_payments')
      .update({
        status: 'approved',
        approved_by: session.person_id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    if (!data) {
      return apiError('payment_not_pending', 409)
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
