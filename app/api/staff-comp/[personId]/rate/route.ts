import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canViewStaffComp, canManageStaffComp } from '@/lib/finance/staff-comp'

/**
 * Персональные тарифы сотрудника.
 *   GET  → { rate } (или дефолт-нули, если ещё не задано). Право: view.
 *   PUT  → задать { hourly_rate, chavruta_rate, chavruta_plus_rate,
 *          chavruta_plus_basis }. Право: manage. Upsert по person_id.
 * Деплой-безопасно к отсутствию таблицы (42P01).
 */
const DEFAULT_RATE = { hourly_rate: 0, chavruta_rate: 0, chavruta_plus_rate: 0, chavruta_plus_basis: 'per_student_month' as const }

function comp(sb: ReturnType<typeof createServerClient>) {
  return (sb as unknown as SupabaseClient).from('staff_compensation')
}

export async function GET(_request: NextRequest, { params }: { params: { personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canViewStaffComp(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    try {
      const { data, error } = await comp(sb)
        .select('person_id, hourly_rate, chavruta_rate, chavruta_plus_rate, chavruta_plus_basis, updated_at')
        .eq('person_id', params.personId).maybeSingle()
      if (error) throw error
      return NextResponse.json({ rate: data ?? { person_id: params.personId, ...DEFAULT_RATE } })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ rate: { person_id: params.personId, ...DEFAULT_RATE } })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as {
      hourly_rate?: number; chavruta_rate?: number; chavruta_plus_rate?: number; chavruta_plus_basis?: string
    }
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0 }
    const basis = body.chavruta_plus_basis === 'per_hour' ? 'per_hour' : 'per_student_month'

    const sb = createServerClient()
    const { data, error } = await comp(sb)
      .upsert({
        person_id: params.personId,
        hourly_rate: num(body.hourly_rate),
        chavruta_rate: num(body.chavruta_rate),
        chavruta_plus_rate: num(body.chavruta_plus_rate),
        chavruta_plus_basis: basis,
        updated_by: session.person_id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'person_id' })
      .select('person_id, hourly_rate, chavruta_rate, chavruta_plus_rate, chavruta_plus_basis, updated_at')
      .single()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ rate: data })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
