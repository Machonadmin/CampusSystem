import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege } from '@/lib/finance/permissions'

/**
 * DELETE /api/finance/semesters/[id]/enrollments/[journeyId]
 * Снимает привязку студентки к семестру И ОТМЕНЯЕТ порождённый счёт
 * (finance_charges.status='cancelled'), чтобы она больше не была должна за этот
 * семестр. Право: create_invoice. Деплой-безопасно (42P01).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; journeyId: string } },
) {
  try {
    await requireFinancePrivilege('create_invoice')
    const sb = createServerClient()

    // Находим привязку (и её счёт).
    let chargeId: string | null = null
    try {
      const { data, error } = await u(sb).from('semester_enrollments')
        .select('charge_id').eq('semester_id', params.id).eq('journey_id', params.journeyId).maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ ok: true }) // уже нет — идемпотентно
      chargeId = (data as { charge_id: string | null }).charge_id
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw e
    }

    // Отменяем счёт (чтобы не был должен).
    if (chargeId) {
      const { error: cErr } = await u(sb).from('finance_charges')
        .update({ status: 'cancelled' }).eq('id', chargeId)
      if (cErr && (cErr as { code?: string }).code !== '42P01') throw cErr
    }

    // Снимаем привязку.
    const { error: dErr } = await u(sb).from('semester_enrollments')
      .delete().eq('semester_id', params.id).eq('journey_id', params.journeyId)
    if (dErr) {
      if ((dErr as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw dErr
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
