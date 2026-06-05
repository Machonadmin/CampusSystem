import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

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

    const [{ data: tasks }, { data: finals }] = await Promise.all([
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
    ])

    return NextResponse.json({
      ...stage,
      tasks: tasks ?? [],
      finals: finals ?? [],
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
