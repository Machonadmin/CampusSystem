import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStaffComp } from '@/lib/finance/staff-comp'

/**
 * POST /api/staff-comp/[personId]/generate-monthly?year&month
 *
 * Начисляет запись типа 'monthly' за КАЖДУЮ семестр-группу (class_groups
 * is_semester=true), которую сотрудник ведёт и где у него задана
 * class_teachers.monthly_rate. amount = monthly_rate, entry_date = 1-е число
 * месяца. Идемпотентно: уникальный индекс person×group×(year,month) →
 * повтор пропускает. Право: manage. Деплой-безопасно (нет колонок → 503).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}` }

export async function POST(request: NextRequest, { params }: { params: { personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const sp = request.nextUrl.searchParams
    const year = Number(sp.get('year')), month = Number(sp.get('month'))
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return apiError('invalid_reference', 400)
    const firstOfMonth = `${year}-${pad2(month)}-01`

    const sb = createServerClient()

    // Группы сотрудника с месячной ставкой (monthly_rate — новая колонка).
    let ctRows: Array<{ class_group_id: string; monthly_rate: number | string | null }> = []
    try {
      const { data, error } = await u(sb).from('class_teachers')
        .select('class_group_id, monthly_rate')
        .eq('teacher_id', params.personId)
      if (error) throw error
      ctRows = (data ?? []) as typeof ctRows
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === '42P01' || code === '42703') return apiError('feature_not_migrated', 503)
      throw e
    }

    // Ставка > 0 и это именно семестр-группа.
    const withRate = ctRows.filter(r => r.monthly_rate != null && Number(r.monthly_rate) > 0)
    if (withRate.length === 0) return NextResponse.json({ created: 0, skipped: 0 })

    const groupIds = [...new Set(withRate.map(r => r.class_group_id))]
    let semesterIds = new Set<string>()
    try {
      const { data, error } = await u(sb).from('class_groups')
        .select('id, is_semester').in('id', groupIds).eq('is_semester', true)
      if (error) throw error
      semesterIds = new Set((data ?? []).map(r => (r as { id: string }).id))
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code === '42P01' || code === '42703') return apiError('feature_not_migrated', 503)
      throw e
    }

    let created = 0, skipped = 0
    for (const r of withRate) {
      if (!semesterIds.has(r.class_group_id)) { skipped++; continue }
      const amount = Math.round(Number(r.monthly_rate) * 100) / 100
      const { error } = await u(sb).from('staff_work_entries')
        .insert({
          person_id: params.personId, entry_type: 'monthly', entry_date: firstOfMonth,
          amount, source_class_group_id: r.class_group_id,
          period_year: year, period_month: month, created_by: session.person_id,
        })
      if (error) {
        const code = (error as { code?: string }).code
        if (code === '23505') { skipped++; continue }   // уже начислено за этот месяц
        if (code === '42P01' || code === '42703') return apiError('feature_not_migrated', 503)
        throw error
      }
      created++
    }

    return NextResponse.json({ created, skipped })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
