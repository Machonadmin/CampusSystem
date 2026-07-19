import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canViewStaffComp, canManageStaffComp, monthRange } from '@/lib/finance/staff-comp'

/**
 * Рабочие записи сотрудника за месяц.
 *   GET  ?year&month → { entries } (право view).
 *   POST → создать запись (право manage). Если amount не задан, но задан hours —
 *          amount = hours × персональная hourly_rate.
 * Деплой-безопасно (42P01).
 */
const TYPES = ['teaching', 'meeting', 'chavruta', 'chavruta_plus', 'shabbat_host', 'shabbat_family', 'other']

function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

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
    try {
      const { data, error } = await u(sb).from('staff_work_entries')
        .select('id, entry_type, entry_date, hours, amount, student_journey_id, title, summary, private_notes, source_lesson_id, created_at')
        .eq('person_id', params.personId).gte('entry_date', from).lte('entry_date', to)
        .order('entry_date', { ascending: true })
      if (error) throw error
      return NextResponse.json({ entries: data ?? [] })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ entries: [] })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as {
      entry_type?: string; entry_date?: string; hours?: number; amount?: number
      student_journey_id?: string | null; title?: string; summary?: string; private_notes?: string
    }
    if (!body.entry_type || !TYPES.includes(body.entry_type)) return apiError('invalid_reference', 400)
    const entryDate = (body.entry_date ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return apiError('invalid_reference', 400)
    const hours = Number.isFinite(Number(body.hours)) && Number(body.hours) >= 0 ? Number(body.hours) : null

    const sb = createServerClient()

    // amount: явный, иначе hours × персональная ставка.
    let amount = Number.isFinite(Number(body.amount)) && Number(body.amount) >= 0 ? Number(body.amount) : null
    if (amount == null && hours != null) {
      try {
        const { data: rate } = await u(sb).from('staff_compensation').select('hourly_rate').eq('person_id', params.personId).maybeSingle()
        const hourly = Number((rate as { hourly_rate?: number } | null)?.hourly_rate ?? 0)
        amount = Math.round(hours * hourly * 100) / 100
      } catch { /* нет тарифа — оставим null */ }
    }

    const { data, error } = await u(sb).from('staff_work_entries')
      .insert({
        person_id: params.personId,
        entry_type: body.entry_type,
        entry_date: entryDate,
        hours, amount,
        student_journey_id: (body.student_journey_id ?? '') || null,
        title: (body.title ?? '').trim() || null,
        summary: (body.summary ?? '').trim() || null,
        private_notes: (body.private_notes ?? '').trim() || null,
        created_by: session.person_id,
      })
      .select('id, entry_type, entry_date, hours, amount, student_journey_id, title, summary, private_notes, created_at')
      .single()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      if ((error as { code?: string }).code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ entry: data }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
