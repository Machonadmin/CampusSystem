import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege } from '@/lib/finance/permissions'

/**
 * PATCH /api/finance/semesters/[id] — изменить цену/имя/статус семестра.
 * Право: finance.create_invoice. Изменение цены НЕ пересчитывает уже
 * начисленные счета (они правятся отдельно в леджере) — меняет цену для
 * будущих начислений этого семестра.
 */
function sem(sb: ReturnType<typeof createServerClient>) {
  return (sb as unknown as SupabaseClient).from('semesters')
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireFinancePrivilege('create_invoice')
    const body = await request.json().catch(() => ({})) as {
      name?: string; price?: number; status?: string
    }
    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = (body.name ?? '').trim() || null
    if (body.price !== undefined) {
      const p = Number(body.price)
      if (!Number.isFinite(p) || p < 0) return apiError('amount_number_gte_0', 400)
      patch.price = p
    }
    if (body.status !== undefined) {
      if (body.status !== 'open' && body.status !== 'closed') return apiError('invalid_reference', 400)
      patch.status = body.status
    }
    if (Object.keys(patch).length === 0) return apiError('no_changes', 400)
    patch.updated_at = new Date().toISOString()

    const sb = createServerClient()
    const { data, error } = await sem(sb)
      .update(patch)
      .eq('id', params.id)
      .select('id, year_label, term_number, name, price, status, created_at')
      .maybeSingle()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    if (!data) return apiError('not_found', 404)
    return NextResponse.json({ semester: data })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
