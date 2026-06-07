import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'

export async function GET(
  _request: NextRequest,
  { params }: { params: { stageInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const sb = createServerClient()

    const { data: stage, error: sErr } = await sb
      .from('stage_instances')
      .select(`
        id, status, final_code, activated_at, completed_at, notes,
        stage_template:stage_templates(id, code, name_ru, description, has_tasks, sort_order),
        process_instance:process_instances(id, journey_id, status)
      `)
      .eq('id', params.stageInstanceId)
      .maybeSingle()
    if (sErr) throw sErr
    if (!stage) return NextResponse.json({ error: 'Подэтап не найден' }, { status: 404 })

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

    const [{ data: tasks }, { data: finals }, can_manage, can_convert] = await Promise.all([
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
    ])

    return NextResponse.json({
      ...stage,
      tasks: tasks ?? [],
      finals: finals ?? [],
      can_manage,
      can_convert,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
