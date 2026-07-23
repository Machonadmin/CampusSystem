import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStaffComp, monthRange } from '@/lib/finance/staff-comp'

/**
 * POST /api/staff-comp/[personId]/generate-chavruta-plus?year&month
 *
 * Начисляет менторство (хеврута-плюс) за месяц по базису сотрудника:
 *   • per_student_month — по одной записи на каждую АКТИВНУЮ пару, amount =
 *     chavruta_plus_rate, дата = 1-е число месяца. Идемпотентно (пропускает, если
 *     запись за эту ученицу в этом месяце уже есть).
 *   • per_hour — ничего не начисляет автоматически (часы вносятся вручную как
 *     записи типа chavruta_plus), возвращает basis:'per_hour'.
 * Право: manage. Деплой-безопасно (42P01).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

export async function POST(request: NextRequest, { params }: { params: { personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const sp = request.nextUrl.searchParams
    const year = Number(sp.get('year')), month = Number(sp.get('month'))
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return apiError('invalid_reference', 400)
    const { from, to } = monthRange(year, month)

    const sb = createServerClient()

    // Тариф + базис.
    let rate = 0, basis = 'per_student_month'
    try {
      const { data } = await u(sb).from('staff_compensation')
        .select('chavruta_plus_rate, chavruta_plus_basis').eq('person_id', params.personId).maybeSingle()
      const c = data as { chavruta_plus_rate?: number; chavruta_plus_basis?: string } | null
      rate = Number(c?.chavruta_plus_rate ?? 0)
      basis = c?.chavruta_plus_basis ?? 'per_student_month'
    } catch (e) { if ((e as { code?: string }).code !== '42P01') throw e }

    if (basis === 'per_hour') {
      return NextResponse.json({ created: 0, skipped: 0, basis: 'per_hour' })
    }

    // Активные пары.
    let assignments: Array<{ student_journey_id: string }> = []
    try {
      const { data, error } = await u(sb).from('chavruta_plus_assignments')
        .select('student_journey_id').eq('teacher_person_id', params.personId).eq('is_active', true)
      if (error) throw error
      assignments = (data ?? []) as typeof assignments
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw e
    }
    if (assignments.length === 0) return NextResponse.json({ created: 0, skipped: 0, basis })

    // Что уже начислено в этом месяце (дедуп по ученице).
    const already = new Set<string>()
    try {
      const { data } = await u(sb).from('staff_work_entries')
        .select('student_journey_id')
        .eq('person_id', params.personId).eq('entry_type', 'chavruta_plus')
        .gte('entry_date', from).lte('entry_date', to)
      for (const r of (data ?? []) as Array<{ student_journey_id: string | null }>) {
        if (r.student_journey_id) already.add(r.student_journey_id)
      }
    } catch (e) { if ((e as { code?: string }).code !== '42P01') throw e }

    let created = 0, skipped = 0
    for (const a of assignments) {
      if (already.has(a.student_journey_id)) { skipped++; continue }
      const { error } = await u(sb).from('staff_work_entries')
        .insert({
          person_id: params.personId, entry_type: 'chavruta_plus', entry_date: from,
          hours: null, amount: rate, student_journey_id: a.student_journey_id,
          created_by: session.person_id,
        })
      if (error) {
        const code = (error as { code?: string }).code
        if (code === '42P01' || code === '42703') return apiError('feature_not_migrated', 503)
        throw error
      }
      created++
    }

    return NextResponse.json({ created, skipped, basis })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
