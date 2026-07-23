import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { pageAll } from '@/lib/reports/paging'
import { foodSummary } from '@/lib/reports/summaries'

/**
 * GET /api/reports/food — READ-ONLY.
 *
 * Охват планами питания:
 *   enrolled   = число студентов (journey) с активной записью на план питания
 *                (DISTINCT journey_id среди meal_enrollments status='active'),
 *   unenrolled = max(0, всего студентов − enrolled).
 * «Всего студентов» = education_journeys с education_status='student'.
 * Право: reports.view.
 *
 * Корректность: число студентов — точный HEAD-COUNT. Активные записи читаются
 * ПОСТРАНИЧНО и дедуплицируются по journey_id (Set) — единичный select
 * обрезался бы на db-max-rows; счёт по строкам завышал бы охват при нескольких
 * планах на студента.
 *
 * Ответ: { enrolled, unenrolled }.
 */
export async function GET() {
  try {
    await requireReportsPrivilege('view')
    const sb = createServerClient()

    // Всего студентов — точный COUNT (HEAD, без строк).
    const { count: studentCount, error: sErr } = await sb
      .from('education_journeys')
      .select('id', { count: 'exact', head: true })
      .eq('education_status', 'student')
    if (sErr) throw sErr

    // Активные записи на питание → уникальные студенты (journey).
    const enrollRows = await pageAll<{ journey_id: string }>((from, to) =>
      sb
        .from('meal_enrollments')
        .select('journey_id')
        .eq('status', 'active')
        .order('id', { ascending: true })
        .range(from, to),
    )
    const enrolled = new Set(enrollRows.map(r => r.journey_id)).size

    return NextResponse.json(foodSummary(enrolled, studentCount ?? 0))
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
