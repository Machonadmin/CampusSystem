import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canViewStaffComp, canApprovePayslip, monthRange, sumEntries } from '@/lib/finance/staff-comp'

/**
 * Расчётный лист сотрудника за месяц.
 *   GET  ?year&month → { period, groups[по типам], total, payslip } (право view).
 *   POST ?year&month → УТВЕРДИТЬ (снимок суммы), право approve (менеджер).
 * Деплой-безопасно (42P01).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

async function loadEntries(sb: ReturnType<typeof createServerClient>, personId: string, from: string, to: string) {
  const { data, error } = await u(sb).from('staff_work_entries')
    .select('entry_type, hours, amount').eq('person_id', personId).gte('entry_date', from).lte('entry_date', to)
  if (error) throw error
  return (data ?? []) as Array<{ entry_type: string; hours: number | string | null; amount: number | string | null }>
}

export async function GET(request: NextRequest, { params }: { params: { personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canViewStaffComp(session))) return apiError('forbidden', 403)

    const sp = request.nextUrl.searchParams
    const year = Number(sp.get('year')), month = Number(sp.get('month'))
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return apiError('invalid_reference', 400)
    const { from, to } = monthRange(year, month)

    const sb = createServerClient()
    let entries: Array<{ entry_type: string; hours: number | string | null; amount: number | string | null }> = []
    try { entries = await loadEntries(sb, params.personId, from, to) }
    catch (e) { if ((e as { code?: string }).code === '42P01') return NextResponse.json({ period: { year, month }, groups: [], total: 0, payslip: null }); throw e }

    const byType = new Map<string, { count: number; hours: number; amount_entries: Array<{ amount: number | string | null }> }>()
    for (const e of entries) {
      const g = byType.get(e.entry_type) ?? { count: 0, hours: 0, amount_entries: [] }
      g.count++; g.hours += e.hours == null ? 0 : Number(e.hours); g.amount_entries.push({ amount: e.amount })
      byType.set(e.entry_type, g)
    }
    const groups = [...byType.entries()].map(([type, g]) => ({
      type, count: g.count, hours: Math.round(g.hours * 100) / 100, amount: sumEntries(g.amount_entries),
    }))
    const total = sumEntries(entries)

    // Статус утверждения.
    let payslip: { status: string; total_amount: number | string; approved_at: string | null } | null = null
    try {
      const { data } = await u(sb).from('staff_payslips')
        .select('status, total_amount, approved_at').eq('person_id', params.personId).eq('year', year).eq('month', month).maybeSingle()
      payslip = data as typeof payslip
    } catch (e) { if ((e as { code?: string }).code !== '42P01') throw e }

    return NextResponse.json({ period: { year, month }, groups, total, payslip })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canApprovePayslip(session))) return apiError('forbidden', 403)

    const sp = request.nextUrl.searchParams
    const year = Number(sp.get('year')), month = Number(sp.get('month'))
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return apiError('invalid_reference', 400)
    const { from, to } = monthRange(year, month)

    const sb = createServerClient()
    let total = 0
    try { total = sumEntries(await loadEntries(sb, params.personId, from, to)) }
    catch (e) { if ((e as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503); throw e }

    const { data, error } = await u(sb).from('staff_payslips')
      .upsert({
        person_id: params.personId, year, month, total_amount: total,
        status: 'approved', approved_by: session.person_id, approved_at: new Date().toISOString(),
      }, { onConflict: 'person_id,year,month' })
      .select('status, total_amount, approved_at').single()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ payslip: data })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
