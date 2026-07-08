import { NextRequest, NextResponse } from 'next/server'
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
    if (!payment) return NextResponse.json({ error: 'Платёж не найден' }, { status: 404 })

    if (payment.status !== 'pending') {
      return NextResponse.json(
        { error: `Подтвердить можно только платёж в статусе 'pending' (текущий: '${payment.status}')` },
        { status: 409 }
      )
    }

    const { data, error } = await sb
      .from('finance_payments')
      .update({
        status: 'approved',
        approved_by: session.person_id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select('*')
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
