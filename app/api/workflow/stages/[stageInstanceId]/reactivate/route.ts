import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege, type EducationPrivilege } from '@/lib/education/permissions'
import { jsonError } from '@/lib/api/handler'

type EduWriteScope = 'view' | 'manage'

/** Подбирает привилегию по education_status journey и типу доступа. */
function pickPrivilege(status: string | null, scope: EduWriteScope): EducationPrivilege {
  if (status === 'lead')      return scope === 'manage' ? 'manage_leads' : 'view_leads'
  if (status === 'applicant') return scope === 'manage' ? 'manage_applicants' : 'view_applicants'
  return scope === 'manage' ? 'manage_students' : 'view_students'
}

/**
 * POST /api/workflow/stages/[stageInstanceId]/reactivate
 *
 * Возвращает пропущенный (skipped) подэтап к выполнению. Право — по
 * education_status journey (manage scope): лид→manage_leads и т.д.
 *
 * Сам возврат подэтапа + создание его стартовых задач — атомарно, одной
 * транзакцией через RPC reactivate_stage
 * (см. migrations/20260702200000_*.sql). Раньше это были последовательные
 * insert/update без отката при частичном сбое (см.
 * docs/workflow-transaction-risk-analysis.md, §1).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { stageInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const sb = createServerClient()

    // journey → education_status + primary_department_id (для проверки прав)
    const { data: si } = await sb
      .from('stage_instances')
      .select('process_instance:process_instances(journey_id)')
      .eq('id', params.stageInstanceId)
      .maybeSingle()

    const journeyId = (si?.process_instance as unknown as { journey_id: string } | null)?.journey_id ?? null

    let eduStatus: string | null = null
    let targetDept: string | null = null
    if (journeyId) {
      const { data: journey } = await sb
        .from('education_journeys')
        .select('education_status, primary_department_id')
        .eq('id', journeyId)
        .maybeSingle()
      eduStatus = journey?.education_status ?? null
      targetDept = journey?.primary_department_id ?? null
    }
    const target = targetDept ? { department_id: targetDept } : undefined

    await requireEducationPrivilege(pickPrivilege(eduStatus, 'manage'), target)

    const { error: rpcErr } = await sb.rpc('reactivate_stage', {
      p_stage_instance_id: params.stageInstanceId,
      p_actor_id: session.person_id,
    })
    if (rpcErr) throw rpcErr

    // Возврат обновлённого stage_instance
    const { data: updated } = await sb
      .from('stage_instances')
      .select('id, status, final_code, activated_at, completed_at, completed_by, stage_template_id')
      .eq('id', params.stageInstanceId)
      .maybeSingle()

    return NextResponse.json({ ok: true, stage_instance: updated })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
