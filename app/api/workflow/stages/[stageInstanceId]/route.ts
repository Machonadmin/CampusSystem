import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { getSignatureMethod } from '@/lib/settings/app-settings'
import { stageSignerAuthority } from '@/lib/workflow/stage-access'

export async function GET(
  _request: NextRequest,
  { params }: { params: { stageInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const sb = createServerClient()

    const { data: stage, error: sErr } = await sb
      .from('stage_instances')
      .select(`
        id, status, final_code, activated_at, completed_at, notes,
        stage_template:stage_templates(id, code, name_ru, description, has_tasks, sort_order, required_role_code, requires_signature),
        process_instance:process_instances(id, journey_id, status)
      `)
      .eq('id', params.stageInstanceId)
      .maybeSingle()
    if (sErr) throw sErr
    if (!stage) return apiError('substage_not_found', 404)

    const stageTemplateId = (stage.stage_template as unknown as { id: string } | null)?.id ?? null
    const journeyId = (stage.process_instance as unknown as { journey_id: string } | null)?.journey_id ?? null

    // Загружаем primary_department_id для проверки прав
    let targetDept: string | null = null
    if (journeyId) {
      const { data: journey } = await sb
        .from('education_journeys')
        .select('primary_department_id')
        .eq('id', journeyId)
        .maybeSingle()
      targetDept = journey?.primary_department_id ?? null
    }
    const target = targetDept ? { department_id: targetDept } : undefined

    const tmpl = stage.stage_template as unknown as { required_role_code: string | null; requires_signature: boolean } | null
    const stageCtx = {
      stageInstanceId: params.stageInstanceId,
      stageTemplateId,
      requiredRoleCode: tmpl?.required_role_code ?? null,
      requiresSignature: !!tmpl?.requires_signature,
      journeyId,
      departmentId: targetDept,
    }

    const [{ data: tasks }, { data: finals }, manageLeads, can_convert, signature_method, signerAuthority] = await Promise.all([
      sb.from('tasks')
        .select('id, title, status, priority, assignee_type, due_date, completed_at')
        .eq('stage_instance_id', params.stageInstanceId)
        .order('created_at', { ascending: true }),
      stageTemplateId
        ? sb.from('stage_finals')
            .select('id, code, name_ru, is_positive, sort_order')
            .eq('stage_template_id', stageTemplateId)
            .order('sort_order', { ascending: true })
        : { data: [] as { id: string; code: string; name_ru: string; is_positive: boolean; sort_order: number }[] },
      hasEducationPrivilege(session, 'manage_leads', target),
      hasEducationPrivilege(session, 'convert_lead', target),
      getSignatureMethod(),
      stageSignerAuthority(session, stageCtx),
    ])

    // A role-gated signer (e.g. dorm_director on the dormitory stage) can act on
    // their own stage even without manage_leads → surface the finals buttons.
    const can_manage = manageLeads || signerAuthority !== null

    return NextResponse.json({
      ...stage,
      tasks: tasks ?? [],
      finals: finals ?? [],
      can_manage,
      can_convert,
      signature_method,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
