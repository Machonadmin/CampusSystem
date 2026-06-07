import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * GET /api/workflow/processes/[processInstanceId]/closing-finals
 * Возвращает финалы последнего подэтапа процесса — варианты для досрочного
 * закрытия.
 *
 * Ответ: { finals: { code, name_ru, is_positive }[] }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { processInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const sb = createServerClient()

    const { data: pi, error: piErr } = await sb
      .from('process_instances')
      .select('process_template_id')
      .eq('id', params.processInstanceId)
      .maybeSingle()
    if (piErr) throw piErr
    if (!pi) return NextResponse.json({ error: 'Процесс не найден' }, { status: 404 })

    // Финальный подэтап = MAX sort_order у шаблона процесса
    const { data: stageTemplates, error: stErr } = await sb
      .from('stage_templates')
      .select('id, sort_order')
      .eq('process_template_id', pi.process_template_id)
      .order('sort_order', { ascending: false })
      .limit(1)
    if (stErr) throw stErr
    const finalStage = (stageTemplates ?? [])[0] as { id: string } | undefined
    if (!finalStage) return NextResponse.json({ finals: [] })

    const { data: finals, error: fErr } = await sb
      .from('stage_finals')
      .select('code, name_ru, is_positive, sort_order')
      .eq('stage_template_id', finalStage.id)
      .order('sort_order', { ascending: true })
    if (fErr) throw fErr

    const result = (finals ?? []).map((f: { code: string; name_ru: string; is_positive: boolean }) => ({
      code: f.code,
      name_ru: f.name_ru,
      is_positive: f.is_positive,
    }))

    return NextResponse.json({ finals: result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
