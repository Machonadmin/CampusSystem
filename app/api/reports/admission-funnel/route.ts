import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { ACCEPTANCE_PROCESS_CODES } from '@/lib/workflow/acceptance-codes'
import { requireReportsPrivilege, requireReportModule } from '@/lib/reports/permissions'
import { errorResponse } from '@/lib/reports/http'
import { pageAll } from '@/lib/reports/paging'
import { loadAdmissionFunnel } from '@/lib/reports/metrics'

/**
 * GET /api/reports/admission-funnel — READ-ONLY.
 *
 * Воронка приёма: сколько лидов → абитуриенток → студенток, коэффициенты
 * конверсии (по срезу статусов) и «узкие места» — сколько активных этапов
 * приёмной комиссии сейчас на каждом шаге. Право: reports.view.
 *
 * Конверсия оценивается по текущему срезу education_status: статус кумулятивен
 * (студентка когда-то была лидом), поэтому «дошли до абитуриентки/студентки»
 * считаются как все, кто на этом статусе ИЛИ дальше (расчёт — lib/reports/funnel.ts).
 */

export async function GET() {
  try {
    await requireReportsPrivilege('view')
    await requireReportModule('education')
    const sb = createServerClient()

    // 1. Воронка — ЕДИНЫЙ источник (lib/reports/metrics.loadAdmissionFunnel),
    // тот же, что в дашборде набора (/api/education/recruitment-report).
    // Soft-deleted journeys (is_deleted) не учитываются.
    const { funnel, conversion } = await loadAdmissionFunnel(sb)

    // 2. Узкие места — активные этапы процесса acceptance по коду шага.
    const stageRows = await pageAll<{ status: string; stage_template: unknown; process_instance: unknown }>((from, to) =>
      sb.from('stage_instances')
        .select('status, stage_template:stage_templates!inner(code, required_role_code, sort_order), process_instance:process_instances!inner(process_template:process_templates!inner(code))')
        .in('process_instance.process_template.code', ACCEPTANCE_PROCESS_CODES)
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
