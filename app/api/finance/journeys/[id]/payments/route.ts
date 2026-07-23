import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStudentFinance } from '@/lib/finance/access'
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
 * Body: { amount (>0), paid_at, method?, reference?, deposited_to?,
 *         from_account?, to_account?, typed_name? (печатная подпись) }
 * recorded_by = текущий пользователь; подписант (signed_by) — из сессии.
 * Для перевода указываем from_account/to_account; для наличных/прочего —
 * deposited_to (куда зачислено). Каждый платёж ПОДПИСАН (кто/когда).
 * Деплой-безопасно: если новых колонок ещё нет (42703) — пишем базовый платёж.
 * 404 — если journey не найден.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStudentFinance(session, params.id))) return apiError('forbidden', 403)

    const body = await request.json() as {
      amount?: number
      paid_at?: string
      method?: string | null
      reference?: string | null
      deposited_to?: string | null
      from_account?: string | null
      to_account?: string | null
      typed_name?: string | null
    }

    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return apiError('amount_number_gt_0', 400)
    }
    const paidAt = body.paid_at?.trim()
    if (!paidAt) {
      return apiError('paid_at_required', 400)
    }
    if (!isIsoDate(paidAt)) {
      return apiError('paid_at_must_be_date', 400)
    }
    // Печатная подпись обязательна (личность — из сессии, не из тела).
    const typedName = (body.typed_name ?? '').trim() || (session.full_name ?? '').trim()
    if (!typedName) return apiError('signature_required', 400)

    const sb = createServerClient()

    const { data: journey, error: jErr } = await sb
      .from('education_journeys')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (jErr) throw jErr
    if (!journey) return apiError('student_not_found', 404)

    const base = {
      journey_id: params.id,
      amount,
      paid_at: paidAt,
      method: body.method?.trim() || null,
      reference: body.reference?.trim() || null,
      status: 'pending' as const,
      recorded_by: session.person_id,
    }
    const full = {
      ...base,
      deposited_to: body.deposited_to?.trim() || null,
      from_account: body.from_account?.trim() || null,
      to_account: body.to_account?.trim() || null,
      signed_by: session.person_id,
      signer_name: (session.full_name ?? '').trim() || session.login_email,
      signature_kind: 'typed',
      typed_name: typedName,
      signed_at: new Date().toISOString(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { data, error } = await sb.from('finance_payments').insert(full as any).select('*').single()
    // Деплой-безопасно: колонок реквизитов/подписи ещё нет → базовый платёж.
    if (error && (error as { code?: string }).code === '42703') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;({ data, error } = await sb.from('finance_payments').insert(base as unknown as FinancePaymentInsert as any).select('*').single())
    }
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
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
