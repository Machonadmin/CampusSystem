import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasFinancePrivilege } from '@/lib/finance/permissions'
import { canManageEducationInAny } from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * Утверждение скидок платы за обучение (tuition_discount_approvals, spec §3.9).
 * Скидка 90% — предложение по умолчанию, требует РУЧНОГО утверждения финансовой
 * ролью (НЕ Chana). Governance-запись, ОТДЕЛЁННАЯ от live-billing (применение
 * одобренной скидки к finance_discounts — отдельное действие финмодуля).
 *
 * GET — список (finance view / approve_discount / education-менеджер).
 * POST — запросить скидку для студентки (education manage_enrollments или
 *   finance create_invoice). Право УТВЕРЖДАТЬ — approve_discount (см. [id] PATCH).
 * Deploy-safe: нет таблицы → пусто.
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = (await hasFinancePrivilege(session, 'view'))
      || (await hasFinancePrivilege(session, 'approve_discount'))
      || (await canManageEducationInAny(session, 'manage_enrollments'))
    if (!allowed) return apiError('forbidden', 403)

    const status = new URL(request.url).searchParams.get('status')?.trim()
    const sb = createServerClient()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (sb.from('tuition_discount_approvals') as any)
        .select('id, journey_id, requested_percent, status, requested_by, decided_by, decided_at, note, created_at, journey:education_journeys!tuition_discount_approvals_journey_id_fkey(id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name))')
        .order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return NextResponse.json({ approvals: data ?? [] })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ approvals: [] })
      throw e
    }
  } catch (err: unknown) {
    return jsonError(err)
  }
}

const requestSchema = z.object({
  journey_id: z.string().uuid(),
  requested_percent: z.number().min(0).max(100).optional(),
  note: z.string().trim().max(2000).nullish(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, requestSchema)
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = (await canManageEducationInAny(session, 'manage_enrollments'))
      || (await hasFinancePrivilege(session, 'create_invoice'))
    if (!allowed) return apiError('forbidden', 403)

    const sb = createServerClient()
    // Дефолтный % — из finance_settings (deploy-safe fallback 90).
    let pct = body.requested_percent
    if (pct === undefined) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (sb.from('finance_settings') as any).select('default_discount_percent').eq('id', true).maybeSingle()
        pct = (data as { default_discount_percent?: number } | null)?.default_discount_percent ?? 90
      } catch { pct = 90 }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from('tuition_discount_approvals') as any)
      .insert({ journey_id: body.journey_id, requested_percent: pct, status: 'pending', requested_by: session.person_id, note: body.note ?? null })
      .select('id').single()
    if (error) {
      if (error.code === '42P01') return apiError('feature_not_migrated', 503)
      if (error.code === '23505') return apiError('record_exists', 409)  // pending already exists
      if (error.code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
