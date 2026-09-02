import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasFinancePrivilege } from '@/lib/finance/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * PATCH /api/finance/discount-approvals/[id] — решение по запросу скидки. Право:
 * approve_discount (финансовая роль; НЕ Chana). status approved|rejected. Само
 * применение одобренной скидки к live-billing (finance_discounts) — отдельное
 * действие финмодуля (§6.2 открыт).
 */
const schema = z.object({
  status: z.enum(['approved', 'rejected']),
  note: z.string().trim().max(2000).nullish(),
})

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseBody(request, schema)
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await hasFinancePrivilege(session, 'approve_discount'))) return apiError('forbidden', 403)

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from('tuition_discount_approvals') as any)
      .update({ status: body.status, note: body.note ?? null, decided_by: session.person_id, decided_at: new Date().toISOString() })
      .eq('id', params.id).select('id').maybeSingle()
    if (error) {
      if (error.code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    if (!data) return apiError('record_not_found', 404)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
