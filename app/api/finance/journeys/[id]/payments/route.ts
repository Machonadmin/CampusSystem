import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStudentFinance } from '@/lib/finance/access'
import { mapDbError } from '@/lib/finance/http'
import { isIsoDate } from '@/lib/finance/validation'
import type { FinancePaymentInsert } from '@/types/database'
import { isMissingColumn } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'
import { financeSignatureImageExists, isValidFinanceSignaturePath } from '@/lib/workflow/signature-storage'

/**
 * POST /api/finance/journeys/[id]/payments
 *
 * Зафиксировать платёж студента. Платёж создаётся в статусе 'pending' и НЕ
 * влияет на баланс, пока не будет подтверждён (finance.approve_payment).
 * Право: finance.create_invoice.
 *
 * Body: { amount (>0), paid_at, method?, reference?, deposited_to?,
 *         from_account?, to_account?, drawing_path (рисунок подписи) }
 * Подпись — ТОЛЬКО рисунок (M19): drawing_path получен из
 * POST /api/finance/journeys/[id]/signature/upload. Печатного имени нет.
 * recorded_by = текущий пользователь; подписант (signed_by, signer_name) и
 * время (signed_at) — из сессии/сервера, никогда из тела.
 * Для перевода указываем from_account/to_account; для наличных/прочего —
 * deposited_to (куда зачислено). Каждый платёж ПОДПИСАН (кто/когда).
 * Деплой-безопасно: если новых колонок ещё нет (42703) — пишем базовый платёж.
 * 404 — если journey не найден.
 */

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
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
      drawing_path?: string | null
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
    // Рисунок подписи обязателен (личность — из сессии, не из тела).
    const drawingPath = typeof body.drawing_path === 'string' ? body.drawing_path.trim() : ''
    if (!drawingPath) return apiError('drawing_required', 400)
    if (!isValidFinanceSignaturePath(drawingPath, params.id)) return apiError('invalid_drawing_path', 400)
    if (!(await financeSignatureImageExists(params.id, drawingPath))) return apiError('invalid_drawing_path', 400)

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
      signature_kind: 'drawn',
      typed_name: null,
      drawing_path: drawingPath,
      signed_at: new Date().toISOString(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { data, error } = await sb.from('finance_payments').insert(full as any).select('*').single()
    // Деплой-безопасно: колонок реквизитов/подписи ещё нет → базовый платёж.
    if (error && isMissingColumn(error)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;({ data, error } = await sb.from('finance_payments').insert(base as unknown as FinancePaymentInsert as any).select('*').single())
    }
    if (error) {
      const m = mapDbError(error)
      return errorResponse(m)
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return errorResponse(m)
    }
    return errorResponse(e)
  }
}
