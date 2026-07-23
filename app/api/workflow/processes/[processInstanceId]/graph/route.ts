import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege, type EducationPrivilege } from '@/lib/education/permissions'

type EduWriteScope = 'view' | 'manage'

/** Подбирает привилегию по education_status journey и типу доступа. */
function pickPrivilege(status: string | null, scope: EduWriteScope): EducationPrivilege {
  if (status === 'lead')      return scope === 'manage' ? 'manage_leads' : 'view_leads'
  if (status === 'applicant') return scope === 'manage' ? 'manage_applicants' : 'view_applicants'
  return scope === 'manage' ? 'manage_students' : 'view_students'
}

interface GraphNode {
  id: string                    // stage_template_id
  code: string
  name_ru: string
  sort_order: number
  activation_rule: 'after_one' | 'after_all'
  status: 'completed' | 'active' | 'waiting' | 'skipped' | 'cancelled' | null
  stage_instance_id: string | null
  final_code: string | null
}

interface GraphEdge {
  from_stage_template_id: string
  to_stage_template_id: string
  final_code: string | null
  final_name: string | null
}

/**
 * GET /api/workflow/processes/[processInstanceId]/graph
 *
 * Данные для схемы процесса (Mermaid). Узлы — stage_templates процесса с текущим
 * статусом из stage_instances; рёбра — stage_transitions между этапами процесса.
 *
 * Право: по education_status journey (view scope) — лид→view_leads и т.д.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { processInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const sb = createServerClient()

    // 1. process_instance
    const { data: pi, error: piErr } = await sb
      .from('process_instances')
      .select('id, status, finish_reason, process_template_id, journey_id')
      .eq('id', params.processInstanceId)
      .maybeSingle()
    if (piErr) throw piErr
    if (!pi) return apiError('process_not_found', 404)

    // 2. journey → education_status + primary_department_id (для проверки прав)
    let eduStatus: string | null = null
    let targetDept: string | null = null
    if (pi.journey_id) {
      const { data: journey } = await sb
        .from('education_journeys')
        .select('education_status, primary_department_id')
        .eq('id', pi.journey_id)
        .maybeSingle()
      eduStatus = journey?.education_status ?? null
      targetDept = journey?.primary_department_id ?? null
    }
    const target = targetDept ? { department_id: targetDept } : undefined

    // Право на просмотр — по статусу journey (бросает 403, если нет)
    await requireEducationPrivilege(pickPrivilege(eduStatus, 'view'), target)

    // 3. stage_templates процесса
    const { data: templates, error: tErr } = await sb
      .from('stage_templates')
      .select('id, code, name_ru, sort_order')
      .eq('process_template_id', pi.process_template_id)
      .order('sort_order', { ascending: true })
    if (tErr) throw tErr
    const stageTemplates = (templates ?? []) as { id: string; code: string; name_ru: string; sort_order: number }[]
    const templateIds = stageTemplates.map(t => t.id)

    if (templateIds.length === 0) {
      return NextResponse.json({
        process_status: pi.status,
        process_final: pi.finish_reason ?? null,
        nodes: [],
        edges: [],
      })
    }

    // 4. Переходы и финалы (для имён условий) и текущие экземпляры подэтапов
    const [{ data: transitions }, { data: finals }, { data: instances }] = await Promise.all([
      sb.from('stage_transitions')
        .select('from_stage_template_id, to_stage_template_id, trigger_final_code, activation_mode, sort_order')
        .in('to_stage_template_id', templateIds)
        .order('sort_order', { ascending: true }),
      sb.from('stage_finals')
        .select('stage_template_id, code, name_ru')
        .in('stage_template_id', templateIds),
      sb.from('stage_instances')
        .select('id, stage_template_id, status, final_code')
        .eq('process_instance_id', pi.id),
    ])

    const transitionRows = (transitions ?? []) as {
      from_stage_template_id: string | null
      to_stage_template_id: string
      trigger_final_code: string | null
      activation_mode: 'after_one' | 'after_all'
      sort_order: number
    }[]
    const finalRows = (finals ?? []) as { stage_template_id: string; code: string; name_ru: string }[]
    const instanceRows = (instances ?? []) as {
      id: string
      stage_template_id: string
      status: 'completed' | 'active' | 'waiting' | 'skipped' | 'cancelled'
      final_code: string | null
    }[]

    // Карта: stage_template_id → его stage_instance (если процесс дошёл)
    const instanceByTemplate = new Map<string, (typeof instanceRows)[number]>()
    for (const si of instanceRows) instanceByTemplate.set(si.stage_template_id, si)

    // Карта: (stage_template_id, final_code) → name_ru — для подписи рёбер
    const finalNameMap = new Map<string, string>()
    for (const f of finalRows) finalNameMap.set(`${f.stage_template_id}::${f.code}`, f.name_ru)

    // Карта: to_stage_template_id → activation_mode (правило активации узла)
    const activationByTo = new Map<string, 'after_one' | 'after_all'>()
    for (const tr of transitionRows) {
      if (!activationByTo.has(tr.to_stage_template_id)) {
        activationByTo.set(tr.to_stage_template_id, tr.activation_mode)
      }
    }

    // 5. Узлы
    const nodes: GraphNode[] = stageTemplates.map(t => {
      const si = instanceByTemplate.get(t.id) ?? null
      return {
        id: t.id,
        code: t.code,
        name_ru: t.name_ru,
        sort_order: t.sort_order,
        activation_rule: activationByTo.get(t.id) ?? 'after_one',
        status: si?.status ?? null,
        stage_instance_id: si?.id ?? null,
        final_code: si?.final_code ?? null,
      }
    })

    // 6. Рёбра (только переходы между узлами процесса; стартовые from=null пропускаем)
    const templateSet = new Set(templateIds)
    const edges: GraphEdge[] = transitionRows
      .filter(tr => tr.from_stage_template_id != null && templateSet.has(tr.from_stage_template_id))
      .map(tr => ({
        from_stage_template_id: tr.from_stage_template_id as string,
        to_stage_template_id: tr.to_stage_template_id,
        final_code: tr.trigger_final_code,
        final_name: tr.trigger_final_code
          ? (finalNameMap.get(`${tr.from_stage_template_id}::${tr.trigger_final_code}`) ?? tr.trigger_final_code)
          : null,
      }))

    return NextResponse.json({
      process_status: pi.status,
      process_final: pi.finish_reason ?? null,
      nodes,
      edges,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
