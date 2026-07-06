import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege } from '@/lib/finance/permissions'
import { mapDbError } from '@/lib/finance/http'
import { isIsoDate } from '@/lib/finance/validation'
import type { FinancePaymentInsert } from '@/types/database'

/**
 * POST /api/finance/journeys/[id]/payments
 *
 * Зафиксировать платёж студента. Платёж создаётся в статусе 'pending' и НЕ
 * влияет на баланс, пока не будет подтверждён (finance.approve_payment).
 * Право: finance.create_invoice.
 *
 * Body: { amount (>0, обязательно), paid_at (обязательно),
 *         method?, reference? }
 * recorded_by = текущий пользователь.
 * 404 — если journey не найден.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireFinancePrivilege('create_invoice')

    const body = await request.json() as {
      amount?: number
      paid_at?: string
      method?: string | null
      reference?: string | null
    }

    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount должен быть числом > 0' }, { status: 400 })
    }
    const paidAt = body.paid_at?.trim()
    if (!paidAt) {
      return NextResponse.json({ error: 'paid_at обязателен' }, { status: 400 })
    }
    if (!isIsoDate(paidAt)) {
      return NextResponse.json({ error: 'paid_at должен быть датой в формате YYYY-MM-DD' }, { status: 400 })
    }

    const sb = createServerClient()

    const { data: journey, error: jErr } = await sb
      .from('education_journeys')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (jErr) throw jErr
    if (!journey) return NextResponse.json({ error: 'Студент не найден' }, { status: 404 })

    const insert: FinancePaymentInsert = {
      journey_id: params.id,
      amount,
      paid_at: paidAt,
      method: body.method?.trim() || null,
      reference: body.reference?.trim() || null,
      status: 'pending',
      recorded_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('finance_payments')
      .insert(insert as any)
      .select('*')
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
