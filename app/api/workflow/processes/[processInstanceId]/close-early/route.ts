import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { jsonError } from '@/lib/api/handler'

interface CloseProcessEarlyResult {
  process_instance_id: string
  final_code: string
  finish_reason: string
  journey_converted: boolean
}

/**
 * POST /api/workflow/processes/[processInstanceId]/close-early
 * Досрочное закрытие процесса с выбранным финалом.
 *
 * Само закрытие (skip подэтапов + cancel задач + завершение процесса +
 * опциональная конверсия лида) — атомарно через RPC close_process_early
 * (см. migrations/20260702230000_*.sql). Раньше это были ~8 последовательных
 * update без отката (см. docs/workflow-transaction-risk-analysis.md, §4).
 *
 * Право: manage_leads (по primary_department_id журнея).
 *        Для финала convert_to_applicant дополнительно convert_lead.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { processInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const body = await request.json() as { final_code?: string }
    if (!body.final_code) {
      return NextResponse.json({ error: 'final_code обязателен' }, { status: 400 })
    }

    const sb = createServerClient()

    // process_instance → journey → primary_department_id
    const { data: pi } = await sb
      .from('process_instances')
      .select('journey_id')
      .eq('id', params.processInstanceId)
      .maybeSingle()

    const journeyId = pi?.journey_id ?? null

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

    const { data: result, error: rpcErr } = await sb.rpc('close_process_early', {
      p_process_instance_id: params.processInstanceId,
      p_final_code: body.final_code,
      p_actor_id: session.person_id,
    })
    if (rpcErr) throw rpcErr

    return NextResponse.json({ success: true, ...(result as CloseProcessEarlyResult) })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
