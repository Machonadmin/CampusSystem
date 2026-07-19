import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege } from '@/lib/finance/permissions'
import { toCents, centsToNumber } from '@/lib/finance/money'

/**
 * Скидка на счёт (הנחה). Уменьшает долг по счёту. Требует ПРИЧИНУ и подпись
 * (в этой фазе — печатная: подписант вводит имя; личность signed_by берётся из
 * сессии, НЕ из тела). Разрешён ЛЮБОЙ процент (0 < p ≤ 100). Сумма скидки
 * считается от суммы счёта в целых копейках; суммарные скидки по счёту не
 * превышают его сумму. Право: finance.create_invoice. Деплой-безопасно.
 *
 * POST body: { percent: number, reason?: string, typed_name?: string }
 */
function u(sb: ReturnType<typeof createServerClient>) {
  return sb as unknown as SupabaseClient
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireFinancePrivilege('create_invoice')
    const body = await request.json().catch(() => ({})) as {
      percent?: number; reason?: string; typed_name?: string
    }

    const percent = Number(body.percent)
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      return apiError('discount_percent_range', 400)
    }
    // Печатная подпись обязательна (кто подписал — из сессии).
    const typedName = (body.typed_name ?? '').trim() || (session.full_name ?? '').trim()
    if (!typedName) return apiError('signature_required', 400)
    const reason = (body.reason ?? '').trim() || null

    const sb = createServerClient()

    // Счёт должен существовать и быть активным.
    const { data: charge, error: cErr } = await sb
      .from('finance_charges')
      .select('id, amount, status')
      .eq('id', params.id)
      .maybeSingle()
    if (cErr) throw cErr
    if (!charge) return apiError('not_found', 404)
    if ((charge as { status: string }).status !== 'active') return apiError('invalid_reference', 400)

    const chargeCents = toCents((charge as { amount: number | string }).amount)

    // Уже выданные скидки по этому счёту — чтобы не превысить сумму счёта.
    let existingCents = 0
    try {
      const { data: existing, error } = await u(sb).from('finance_discounts')
        .select('amount').eq('charge_id', params.id)
      if (error) throw error
      for (const d of (existing ?? []) as Array<{ amount: number | string }>) existingCents += toCents(d.amount)
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw e
    }

    let discountCents = Math.round((chargeCents * percent) / 100)
    const remaining = chargeCents - existingCents
    if (remaining <= 0) return apiError('discount_exceeds_charge', 400)
    if (discountCents > remaining) discountCents = remaining // не превышаем сумму счёта

    const { data, error } = await u(sb).from('finance_discounts')
      .insert({
        charge_id: params.id,
        percent,
        amount: centsToNumber(discountCents),
        reason,
        signed_by: session.person_id,
        signer_name: (session.full_name ?? '').trim() || session.login_email,
        signature_kind: 'typed',
        typed_name: typedName,
        signed_at: new Date().toISOString(),
      })
      .select('id, percent, amount, reason, signer_name, typed_name, signed_at, created_at')
      .single()
    if (error) {
      if (['42P01', '42703'].includes((error as { code?: string }).code ?? '')) return apiError('feature_not_migrated', 503)
      throw error
    }

    return NextResponse.json({ discount: data }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
