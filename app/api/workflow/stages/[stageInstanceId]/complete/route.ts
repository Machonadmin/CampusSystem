import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { jsonError } from '@/lib/api/handler'

interface CompleteStageResult {
  stage_instance_id: string
  activated_stage_ids: string[]
  process_completed: boolean
  finish_reason: string | null
}

/**
 * POST /api/workflow/stages/[stageInstanceId]/complete
 *
 * Завершение подэтапа + продвижение процесса — атомарно через RPC
 * complete_stage (см. migrations/20260703120000_*.sql). Раньше это были 15+
 * последовательных update без отката — самая сложная функция движка
 * (docs/complete-stage-conversion-prep.md, docs/complete-stage-baseline.md).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { stageInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const body = await request.json() as {
      final_code: string
      result_data?: Record<string, unknown>
    }
    if (!body.final_code) {
      return apiError('final_code_required', 400)
    }

    const sb = createServerClient()

    // Загружаем primary_department_id: stage_instance → process_instance → journey
    const { data: si } = await sb
      .from('stage_instances')
      .select('process_instance:process_instances(journey_id)')
      .eq('id', params.stageInstanceId)
      .maybeSingle()

    const journeyId = (si?.process_instance as unknown as { journey_id: string } | null)?.journey_id ?? null

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

    await requireEducationPrivilege('manage_leads', target)
    if (body.final_code === 'convert_to_applicant') {
      await requireEducationPrivilege('convert_lead', target)
    }

    const { data: result, error: rpcErr } = await sb.rpc('complete_stage', {
      p_stage_instance_id: params.stageInstanceId,
      p_final_code: body.final_code,
      p_actor_id: session.person_id,
      p_result_data: body.result_data ?? null,
    })
    if (rpcErr) throw rpcErr

    // Автозапуск процесса «Приём» при переходе лида в абитуриенты.
    // Best-effort: ошибка не должна валить уже выполненное завершение подэтапа.
    // start_process идемпотентен — повторный запуск вернёт существующий инстанс.
    if ((result as CompleteStageResult).finish_reason === 'converted' && journeyId) {
      const { error: admErr } = await sb.rpc('start_process', {
        p_process_code: 'admission',
        p_journey_id: journeyId,
        p_actor_id: session.person_id,
      })
      if (admErr) console.error('[complete] авто-запуск «Приём»:', admErr)
    }

    return NextResponse.json({ ok: true, ...(result as CompleteStageResult) })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
