import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingRelation, isMissingTable } from '@/lib/supabase/errors'
import { getSession } from '@/lib/auth/session'
import { canManageStudentFinance } from '@/lib/finance/access'
import { toCents, centsToNumber } from '@/lib/finance/money'
import { errorResponse } from '@/lib/api/handler'
import { financeSignatureImageExists, isValidFinanceSignaturePath } from '@/lib/workflow/signature-storage'

/**
 * Скидка на счёт (הנחה). Уменьшает долг по счёту. Требует ПРИЧИНУ и подпись —
 * ТОЛЬКО рисунок (M19): drawing_path из POST /api/finance/journeys/<journey>/signature/upload.
 * Кто подписал (signed_by, signer_name) и когда — из сессии/сервера, НЕ из тела. Разрешён ЛЮБОЙ процент (0 < p ≤ 100). Сумма скидки
 * считается от суммы счёта в целых копейках; суммарные скидки по счёту не
 * превышают его сумму. Право: finance.create_invoice. Деплой-безопасно.
 *
 * POST body: { percent: number, reason?: string, drawing_path: string }
 */

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const body = await request.json().catch(() => ({})) as {
      percent?: number; reason?: string; drawing_path?: string
    }

    const percent = Number(body.percent)
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return apiError('discount_percent_range', 400)
    }
    // Рисунок подписи обязателен (кто подписал — из сессии).
    const drawingPath = typeof body.drawing_path === 'string' ? body.drawing_path.trim() : ''
    if (!drawingPath) return apiError('drawing_required', 400)
    const reason = (body.reason ?? '').trim() || null

    const sb = createServerClient()

    // Счёт должен существовать и быть активным; доступ — по его journey.
    const { data: charge, error: cErr } = await sb
      .from('finance_charges')
      .select('id, amount, status, journey_id')
      .eq('id', params.id)
      .maybeSingle()
    if (cErr) throw cErr
    if (!charge) return apiError('not_found', 404)
    if (!(await canManageStudentFinance(session, (charge as { journey_id: string }).journey_id))) {
      return apiError('forbidden', 403)
    }
    if ((charge as { status: string }).status !== 'active') return apiError('invalid_reference', 400)
    // Рисунок должен лежать в папке подписей ЭТОЙ студентки (защита от IDOR).
    const chargeJourneyId = (charge as { journey_id: string }).journey_id
    if (!isValidFinanceSignaturePath(drawingPath, chargeJourneyId)) return apiError('invalid_drawing_path', 400)
    if (!(await financeSignatureImageExists(chargeJourneyId, drawingPath))) return apiError('invalid_drawing_path', 400)

    const chargeCents = toCents((charge as { amount: number | string }).amount)

    // Уже выданные скидки по этому счёту — чтобы не превысить сумму счёта.
    let existingCents = 0
    try {
      const { data: existing, error } = await sb.from('finance_discounts')
        .select('amount').eq('charge_id', params.id)
      if (error) throw error
      for (const d of (existing ?? []) as Array<{ amount: number | string }>) existingCents += toCents(d.amount)
    } catch (e) {
      if (isMissingTable(e)) return apiError('feature_not_migrated', 503)
      throw e
    }

    let discountCents = Math.round((chargeCents * percent) / 100)
    const remaining = chargeCents - existingCents
    if (remaining <= 0) return apiError('discount_exceeds_charge', 400)
    if (discountCents > remaining) discountCents = remaining // не превышаем сумму счёта

    const { data, error } = await sb.from('finance_discounts')
      .insert({
        charge_id: params.id,
        percent,
        amount: centsToNumber(discountCents),
        reason,
        signed_by: session.person_id,
        signer_name: (session.full_name ?? '').trim() || session.login_email,
        signature_kind: 'drawn',
        typed_name: null,
        drawing_path: drawingPath,
        signed_at: new Date().toISOString(),
      })
      .select('id, percent, amount, reason, signer_name, typed_name, drawing_path, signed_at, created_at')
      .single()
    if (error) {
      if (isMissingRelation(error)) return apiError('feature_not_migrated', 503)
      throw error
    }

    return NextResponse.json({ discount: data }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
