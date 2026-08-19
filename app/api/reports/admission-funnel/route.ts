import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireReportsPrivilege } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { pageAll } from '@/lib/reports/paging'

/**
 * GET /api/reports/admission-funnel — READ-ONLY.
 *
 * Воронка приёма: сколько лидов → абитуриенток → студенток, коэффициенты
 * конверсии (по срезу статусов) и «узкие места» — сколько активных этапов
 * приёмной комиссии сейчас на каждом шаге. Право: reports.view.
 *
 * Конверсия оценивается по текущему срезу education_status: статус кумулятивен
 * (студентка когда-то была лидом), поэтому «дошли до абитуриентки/студентки»
 * считаются как все, кто на этом статусе ИЛИ дальше.
 */

const BEYOND_LEAD = ['applicant', 'student', 'on_leave', 'graduated', 'expelled']
const BEYOND_APPLICANT = ['student', 'on_leave', 'graduated', 'expelled']

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

export async function GET() {
  try {
    await requireReportsPrivilege('view')
    const sb = createServerClient()

    // 1. Срез по education_status (постранично).
    const journeys = await pageAll<{ education_status: string }>((from, to) =>
      sb.from('education_journeys').select('education_status').order('id', { ascending: true }).range(from, to),
    )
    const byStatus: Record<string, number> = {}
    for (const j of journeys) byStatus[j.education_status] = (byStatus[j.education_status] ?? 0) + 1

    const leads = byStatus['lead'] ?? 0
    const reachedApplicant = BEYOND_LEAD.reduce((s, k) => s + (byStatus[k] ?? 0), 0)
    const reachedStudent = BEYOND_APPLICANT.reduce((s, k) => s + (byStatus[k] ?? 0), 0)
    const everLead = leads + reachedApplicant

    const funnel = {
      leads,
      applicants: byStatus['applicant'] ?? 0,
      students: byStatus['student'] ?? 0,
      reached_applicant: reachedApplicant,
      reached_student: reachedStudent,
    }
    const conversion = {
      lead_to_applicant: pct(reachedApplicant, everLead),
      applicant_to_student: pct(reachedStudent, reachedApplicant),
    }

    // 2. Узкие места — активные этапы процесса acceptance по коду шага.
    const stageRows = await pageAll<{ status: string; stage_template: unknown; process_instance: unknown }>((from, to) =>
      sb.from('stage_instances')
        .select('status, stage_template:stage_templates!inner(code, required_role_code, sort_order), process_instance:process_instances!inner(process_template:process_templates!inner(code))')
        .eq('process_instance.process_template.code', 'acceptance')
        .order('id', { ascending: true })
        .range(from, to),
    )
    const stageMap = new Map<string, { code: string; sort: number; active: number; completed: number }>()
    for (const r of stageRows) {
      const tmpl = r.stage_template as { code: string; required_role_code: string | null; sort_order: number } | null
      if (!tmpl?.required_role_code) continue // только ролевые этапы приёма
      const cur = stageMap.get(tmpl.code) ?? { code: tmpl.code, sort: tmpl.sort_order ?? 0, active: 0, completed: 0 }
      if (r.status === 'active') cur.active++
      else if (r.status === 'completed') cur.completed++
      stageMap.set(tmpl.code, cur)
    }
    const stages = [...stageMap.values()].sort((a, b) => a.sort - b.sort)

    return NextResponse.json({ funnel, conversion, stages })
  } catch (err: unknown) {
    return errorResponse(err)
  }
}
