import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege, type EducationPrivilege } from '@/lib/education/permissions'
import { jsonError } from '@/lib/api/handler'
import { syncAcceptanceTasks } from '@/lib/workflow/acceptance-tasks'
import { flattenPhones } from '@/lib/persons/phone'

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
 * Право: по education_status журнея (как /stages/[id]/reactivate и кнопка в
 *        карточке): лид → manage_leads, абитуриентка → manage_applicants,
 *        иначе manage_students. Раньше всегда требовался manage_leads, а кнопка
 *        показывалась по manage_applicants — у кого было одно без другого,
 *        получал ошибку. Для финала convert_to_applicant дополнительно convert_lead.
 */
function managePrivilege(status: string | null): EducationPrivilege {
  if (status === 'lead') return 'manage_leads'
  if (status === 'applicant') return 'manage_applicants'
  return 'manage_students'
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ processInstanceId: string }> }
) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const body = await request.json() as { final_code?: string }
    if (!body.final_code) {
      return apiError('final_code_required', 400)
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
    let eduStatus: string | null = null
    if (journeyId) {
      const { data: journey } = await sb
        .from('education_journeys')
        .select('primary_department_id, education_status')
        .eq('id', journeyId)
        .maybeSingle()
      targetDept = journey?.primary_department_id ?? null
      eduStatus = journey?.education_status ?? null
    }

    const target = targetDept ? { department_id: targetDept } : undefined

    await requireEducationPrivilege(journeyId ? managePrivilege(eduStatus) : 'manage_leads', target)
    if (body.final_code === 'convert_to_applicant') {
      await requireEducationPrivilege('convert_lead', target)
      // Та же проверка готовности, что у кнопки «העבר לוועדת קבלה» (handoff):
      // без имени и телефона передавать в приём нельзя. Раньше досрочное
      // закрытие обходило её.
      if (journeyId) {
        const { data: j } = await sb
          .from('education_journeys')
          .select('person:persons!applicant_profiles_person_id_fkey(first_name, full_name, phones)')
          .eq('id', journeyId)
          .maybeSingle()
        const person = (j?.person as unknown as { first_name?: string | null; full_name?: string | null; phones?: unknown } | null) ?? null
        const missing: string[] = []
        if (!(person?.first_name?.trim() || person?.full_name?.trim())) missing.push('name')
        if (flattenPhones(person?.phones).length === 0) missing.push('phone')
        if (missing.length > 0) return apiError('handoff_missing_fields', 400, { missing })
      }
    }

    const { data: result, error: rpcErr } = await sb.rpc('close_process_early', {
      p_process_instance_id: params.processInstanceId,
      p_final_code: body.final_code,
      p_actor_id: session.person_id,
    })
    if (rpcErr) throw rpcErr

    // Автозапуск процесса «Приём» при переходе лида в абитуриенты (best-effort,
    // идемпотентно) — та же логика, что и в /stages/[id]/complete.
    if ((result as CloseProcessEarlyResult).finish_reason === 'converted' && journeyId) {
      const { error: admErr } = await sb.rpc('start_process', {
        p_process_code: 'acceptance_v2',
        p_journey_id: journeyId,
        p_actor_id: session.person_id,
      })
      if (admErr) console.error('[close-early] авто-запуск «Приёмная комиссия»:', admErr)

      // Условный «Пансион» — гейтинг по needs_dormitory сразу после старта
      // приёма (best-effort, идемпотентно; NULL-флаг — no-op). См. 20260724190000.
      const { error: gateErr } = await sb.rpc('acceptance_apply_dormitory_gating', {
        p_journey_id: journeyId,
        p_actor_id: session.person_id,
      })
      if (gateErr) console.error('[close-early] dormitory gating:', gateErr)
    }

    // Автозадачи приёма — после ЛЮБОГО досрочного закрытия. Для передачи в приём
    // (converted) создаёт задачи первого этапа (בירור יהדות). Для закрытия самого
    // приёма — закрывает открытые задачи подписи: RPC отменяет задачи по колонке
    // stage_instance_id, а у задач приёма этапа есть только metadata, поэтому они
    // оставались висеть у всех подписантов. Best-effort.
    if (journeyId) {
      try {
        await syncAcceptanceTasks(sb, journeyId, session.person_id)
      } catch (taskErr) {
        console.error('[close-early] syncAcceptanceTasks:', taskErr)
      }
    }

    return NextResponse.json({ success: true, ...(result as CloseProcessEarlyResult) })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
