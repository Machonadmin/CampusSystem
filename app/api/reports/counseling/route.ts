import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { pageAll } from '@/lib/reports/paging'
import { counselingSummary } from '@/lib/reports/summaries'

/**
 * GET /api/reports/counseling — READ-ONLY.
 *
 * Сводка психолога (reuse psychologist/counseling sessionStats + разбивка по риску):
 *   open_sessions      — открытых консультаций,
 *   upcoming_followups — открытых сессий с предстоящим контролем,
 *   overdue_followups  — открытых сессий с просроченным контролем,
 *   by_risk            — разбивка карт сопровождения (psych_profiles) по risk_level
 *                        (none / low / medium / high).
 * Право: reports.view.
 *
 * Корректность: и сессии, и профили читаются ПОСТРАНИЧНО — подсчёт по строкам
 * обрезался бы на db-max-rows. «Сегодня» передаётся параметром.
 *
 * Ответ: { open_sessions, upcoming_followups, overdue_followups, by_risk }.
 */
export async function GET() {
  try {
    await requireReportsPrivilege('view')
    const sb = createServerClient()

    const today = new Date().toISOString().slice(0, 10)

    const sessions = await pageAll<{ status: string; follow_up_date: string | null }>((from, to) =>
      sb
        .from('psych_sessions')
        .select('status, follow_up_date')
        .order('id', { ascending: true })
        .range(from, to),
    )
    const profiles = await pageAll<{ risk_level: string }>((from, to) =>
      sb
        .from('psych_profiles')
        .select('risk_level')
        .order('id', { ascending: true })
        .range(from, to),
    )

    return NextResponse.json(counselingSummary(sessions, profiles, today))
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
