import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStaffComp, monthRange, lessonHours } from '@/lib/finance/staff-comp'

/**
 * POST /api/staff-comp/[personId]/generate-teaching?year&month
 * Начисляет записи типа 'teaching' за все уроки, которые сотрудник вёл в этом
 * месяце: hours = длительность урока, amount = hours × персональная hourly_rate.
 * Идемпотентно (уникальный индекс person_id+source_lesson_id → повтор пропускает).
 * Право: manage. Деплой-безопасно.
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

    // Персональная ставка.
    let hourly = 0
    try {
      const { data: rate } = await u(sb).from('staff_compensation').select('hourly_rate').eq('person_id', params.personId).maybeSingle()
      hourly = Number((rate as { hourly_rate?: number } | null)?.hourly_rate ?? 0)
    } catch (e) { if ((e as { code?: string }).code !== '42P01') throw e }

    // Группы, которые ведёт сотрудник.
    const { data: ct, error: ctErr } = await sb.from('class_teachers').select('class_group_id').eq('teacher_id', params.personId)
    if (ctErr) throw ctErr
    const groupIds = [...new Set((ct ?? []).map(r => (r as { class_group_id: string }).class_group_id))]
    if (groupIds.length === 0) return NextResponse.json({ created: 0, skipped: 0 })

    // Уроки этих групп за месяц (не отменённые).
    const { data: lessonsRaw, error: lErr } = await sb.from('lessons')
      .select('id, scheduled_date, scheduled_time, scheduled_end_time, is_cancelled')
      .in('class_group_id', groupIds).gte('scheduled_date', from).lte('scheduled_date', to)
    if (lErr) throw lErr
    const lessons = (lessonsRaw ?? []) as Array<{ id: string; scheduled_date: string; scheduled_time: string | null; scheduled_end_time: string | null; is_cancelled: boolean | null }>

    let created = 0, skipped = 0
    for (const l of lessons) {
      if (l.is_cancelled) { skipped++; continue }
      const hours = lessonHours(l.scheduled_time, l.scheduled_end_time)
      if (hours == null) { skipped++; continue } // без времён — не считаем
      const amount = Math.round(hours * hourly * 100) / 100
      const { error } = await u(sb).from('staff_work_entries')
        .insert({
          person_id: params.personId, entry_type: 'teaching', entry_date: l.scheduled_date,
          hours, amount, source_lesson_id: l.id, created_by: session.person_id,
        })
      if (error) {
        const code = (error as { code?: string }).code
        if (code === '23505') { skipped++; continue }   // уже начислено за этот урок
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
