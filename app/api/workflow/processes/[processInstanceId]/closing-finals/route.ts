import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { errorResponse } from '@/lib/api/handler'
import { ACCEPTANCE_PROCESS_CODES, ACCEPTANCE_EARLY_CLOSE_BLOCKED } from '@/lib/workflow/acceptance-codes'

/**
 * GET /api/workflow/processes/[processInstanceId]/closing-finals
 * Возвращает финалы последнего подэтапа процесса — варианты для досрочного
 * закрытия.
 *
 * Ответ: { finals: { code, name_ru, is_positive }[] }
 */
export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ processInstanceId: string }> }
) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    // Настройки процесса — только для штата, не для портального токена.
    if (session.principal === 'student') return apiError('forbidden', 403)

    const sb = createServerClient()

    const { data: pi, error: piErr } = await sb
      .from('process_instances')
      .select('process_template_id, process_template:process_templates(code)')
      .eq('id', params.processInstanceId)
      .maybeSingle()
    if (piErr) throw piErr
    if (!pi) return apiError('process_not_found', 404)

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

    // Приём: «התקבלה»/«לימודים חיצוניים» досрочно не предлагаем (решение владельца).
    const procCode = (pi.process_template as unknown as { code: string | null } | null)?.code ?? null
    const isAcceptance = procCode != null && ACCEPTANCE_PROCESS_CODES.includes(procCode)
    const result = (finals ?? [])
      .filter((f: { code: string }) => !(isAcceptance && ACCEPTANCE_EARLY_CLOSE_BLOCKED.includes(f.code)))
      .map((f: { code: string; name_ru: string; is_positive: boolean }) => ({
      code: f.code,
      name_ru: f.name_ru,
      is_positive: f.is_positive,
    }))

    return NextResponse.json({ finals: result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
