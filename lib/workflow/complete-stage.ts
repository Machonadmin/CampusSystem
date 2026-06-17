import { createServerClient } from '@/lib/supabase/server'
import { createStartingTasks } from '@/lib/workflow/start-process'

type SB = ReturnType<typeof createServerClient>

export interface CompleteStageResult {
  stage_instance_id: string
  activated_stage_ids: string[]
  process_completed: boolean
  finish_reason: string | null
}

export async function completeStage(
  sb: SB,
  stageInstanceId: string,
  finalCode: string,
  actorId: string | null,
  resultData?: Record<string, unknown>,
): Promise<CompleteStageResult> {
  const now = new Date().toISOString()

  // 1. Load stage instance with template + process context
  const { data: si, error: siErr } = await sb
    .from('stage_instances')
    .select(`
      id, status, stage_template_id, process_instance_id,
      stage_template:stage_templates(id, code, has_tasks),
      process_instance:process_instances(id, journey_id, status)
    `)
    .eq('id', stageInstanceId)
    .maybeSingle()
  if (siErr) throw siErr
  if (!si) {
    const err = Object.assign(new Error('Подэтап не найден'), { status: 404 })
    throw err
  }
  if (si.status !== 'active') {
    const err = Object.assign(new Error('Подэтап не активен'), { status: 400 })
    throw err
  }

  const stageTemplate = si.stage_template as unknown as { id: string; code: string; has_tasks: boolean } | null
  const processInstance = si.process_instance as unknown as { id: string; journey_id: string; status: string } | null
  if (!stageTemplate || !processInstance) {
    throw new Error('Ошибка данных подэтапа')
  }

  // 2. Mark stage as completed
  const { error: updateErr } = await sb
    .from('stage_instances')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      status: 'completed',
      final_code: finalCode,
      completed_at: now,
      completed_by: actorId,
      result_data: resultData ?? {},
    } as any)
    .eq('id', stageInstanceId)
  if (updateErr) throw updateErr

  // System event: stage completed
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: _evErr } = await sb.from('process_events').insert({
      stage_instance_id: stageInstanceId,
      event_type: 'system',
      content: `Подэтап завершён: ${finalCode}`,
      author_id: actorId,
      metadata: { final_code: finalCode },
    } as any)
    void _evErr
  }

  // 3. Complete all pending tasks for this stage
  const { error: taskErr } = await sb
    .from('tasks')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ status: 'completed', completed_at: now } as any)
    .eq('stage_instance_id', stageInstanceId)
    .neq('status', 'completed')
    .neq('status', 'cancelled')
  if (taskErr) throw taskErr

  // 3b. Если финал закрывает процесс целиком — отменить остальные подэтапы/задачи
  {
    const { data: stageFinal } = await sb
      .from('stage_finals')
      .select('closes_process, process_finish_reason')
      .eq('stage_template_id', si.stage_template_id)
      .eq('code', finalCode)
      .maybeSingle()

    const final = stageFinal as { closes_process: boolean; process_finish_reason: string | null } | null
    if (final?.closes_process) {
      const processFinishReason = final.process_finish_reason ?? finalCode

      // а. Отменить оставшиеся active/waiting подэтапы (текущий уже completed)
      // Сначала соберём ID для event-записей
      const { data: stagesToCancel } = await sb
        .from('stage_instances')
        .select('id')
        .eq('process_instance_id', processInstance.id)
        .in('status', ['active', 'waiting'])

      const { error: siCancelErr } = await sb
        .from('stage_instances')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: 'cancelled', completed_at: now, completed_by: actorId } as any)
        .eq('process_instance_id', processInstance.id)
        .in('status', ['active', 'waiting'])
      if (siCancelErr) throw siCancelErr

      // System events: stage cancelled
      for (const s of stagesToCancel ?? []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: _evErr } = await sb.from('process_events').insert({
          stage_instance_id: s.id,
          event_type: 'system',
          content: 'Подэтап отменён',
          author_id: actorId,
          metadata: { reason: 'closes_process', final_code: finalCode },
        } as any)
        void _evErr
      }

      // б. Отменить незавершённые задачи всех подэтапов процесса
      const { data: allSi, error: allSiErr } = await sb
        .from('stage_instances')
        .select('id')
        .eq('process_instance_id', processInstance.id)
      if (allSiErr) throw allSiErr
      const allSiIds = (allSi ?? []).map((s: { id: string }) => s.id)

      if (allSiIds.length > 0) {
        const { error: taskCancelErr } = await sb
          .from('tasks')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ status: 'cancelled', completed_at: now } as any)
          .in('stage_instance_id', allSiIds)
          .in('status', ['unassigned', 'pending', 'in_progress', 'review'])
        if (taskCancelErr) throw taskCancelErr
      }

      // в. Закрыть процесс
      const { error: piCancelErr } = await sb
        .from('process_instances')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: 'cancelled', finish_reason: processFinishReason, finished_at: now } as any)
        .eq('id', processInstance.id)
      if (piCancelErr) throw piCancelErr

      // г. Конверсия лида в абитуриента
      if (processFinishReason === 'converted') {
        const { error: jErr } = await sb
          .from('education_journeys')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ education_status: 'applicant' } as any)
          .eq('id', processInstance.journey_id)
        if (jErr) throw jErr
      }

      return {
        stage_instance_id: stageInstanceId,
        activated_stage_ids: [],
        process_completed: true,
        finish_reason: processFinishReason,
      }
    }
  }

  // 4. Find outgoing transitions for this stage + final_code
  const { data: transitions, error: trErr } = await sb
    .from('stage_transitions')
    .select('to_stage_template_id, activation_mode, trigger_final_code')
    .eq('from_stage_template_id', si.stage_template_id)
    .eq('trigger_final_code', finalCode)
    .order('sort_order', { ascending: true })
  if (trErr) throw trErr

  // 4b. ФИО лида — подставляется в title задач при создании
  let personFullName: string | undefined
  {
    const { data: journeyRow } = await sb
      .from('education_journeys')
      .select('person_id')
      .eq('id', processInstance.journey_id)
      .maybeSingle()
    const personId = (journeyRow as { person_id: string | null } | null)?.person_id
    if (personId) {
      const { data: personRow } = await sb
        .from('persons')
        .select('full_name')
        .eq('id', personId)
        .maybeSingle()
      personFullName = (personRow as { full_name: string | null } | null)?.full_name ?? undefined
    }
  }

  // 5. Activate target stages
  const activatedStageIds: string[] = []
  const seenTargets = new Set<string>()

  for (const tr of transitions ?? []) {
    if (seenTargets.has(tr.to_stage_template_id)) continue
    seenTargets.add(tr.to_stage_template_id)

    let shouldActivate = false

    if (tr.activation_mode === 'after_one') {
      shouldActivate = true
    } else {
      // after_all: every predecessor stage must be completed
      const { data: allToTarget } = await sb
        .from('stage_transitions')
        .select('from_stage_template_id')
        .eq('to_stage_template_id', tr.to_stage_template_id)

      const predecessorIds = ((allToTarget ?? []) as { from_stage_template_id: string | null }[])
        .map(t => t.from_stage_template_id)
        .filter((id): id is string => id !== null)

      if (predecessorIds.length > 0) {
        const { data: predecessors } = await sb
          .from('stage_instances')
          .select('status')
          .eq('process_instance_id', processInstance.id)
          .in('stage_template_id', predecessorIds)

        shouldActivate = (predecessors ?? []).every(
          (p: { status: string }) => p.status === 'completed' || p.status === 'skipped'
        )
      } else {
        shouldActivate = true
      }
    }

    if (!shouldActivate) continue

    // Find the waiting stage_instance for this target
    const { data: targetSi, error: targetErr } = await sb
      .from('stage_instances')
      .select('id')
      .eq('process_instance_id', processInstance.id)
      .eq('stage_template_id', tr.to_stage_template_id)
      .eq('status', 'waiting')
      .maybeSingle()
    if (targetErr) throw targetErr
    if (!targetSi) continue

    // Activate it
    const { error: activateErr } = await sb
      .from('stage_instances')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status: 'active', activated_at: now } as any)
      .eq('id', targetSi.id)
    if (activateErr) throw activateErr
    activatedStageIds.push(targetSi.id)

    // System event: stage activated via transition
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: _evErr } = await sb.from('process_events').insert({
        stage_instance_id: targetSi.id,
        event_type: 'system',
        content: 'Подэтап активирован',
        author_id: actorId,
        metadata: null,
      } as any)
      void _evErr
    }

    // Create tasks if the newly activated stage has them
    const { data: targetTemplate } = await sb
      .from('stage_templates')
      .select('has_tasks')
      .eq('id', tr.to_stage_template_id)
      .maybeSingle()

    if (targetTemplate?.has_tasks && actorId) {
      await createStartingTasks(sb, tr.to_stage_template_id, targetSi.id, actorId, personFullName)
    }
  }

  // 5b. Пометить как skipped waiting-подэтапы, которые больше не могут быть
  //     активированы: все их predecessors уже завершены или пропущены.
  {
    const { data: waitingInstances } = await sb
      .from('stage_instances')
      .select('id, stage_template_id')
      .eq('process_instance_id', processInstance.id)
      .eq('status', 'waiting')

    const justActivated = new Set(activatedStageIds)

    for (const wi of (waitingInstances ?? []) as { id: string; stage_template_id: string }[]) {
      if (justActivated.has(wi.id)) continue

      const { data: incomingTr } = await sb
        .from('stage_transitions')
        .select('from_stage_template_id')
        .eq('to_stage_template_id', wi.stage_template_id)

      // Дедуплицируем: один predecessor может дать несколько transitions (разные final_codes)
      const predTemplateIds = [...new Set(
        ((incomingTr ?? []) as { from_stage_template_id: string | null }[])
          .map(t => t.from_stage_template_id)
          .filter((id): id is string => id !== null)
      )]

      if (predTemplateIds.length === 0) continue

      const { data: predInstances } = await sb
        .from('stage_instances')
        .select('status')
        .eq('process_instance_id', processInstance.id)
        .in('stage_template_id', predTemplateIds)

      const allTerminated =
        (predInstances ?? []).length >= predTemplateIds.length &&
        (predInstances ?? []).every(
          (p: { status: string }) => p.status === 'completed' || p.status === 'skipped'
        )

      if (allTerminated) {
        const { error: skipErr } = await sb
          .from('stage_instances')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ status: 'skipped' } as any)
          .eq('id', wi.id)
        if (skipErr) console.error('[completeStage] failed to skip unreachable stage:', skipErr)
      }
    }
  }

  // 6. Check if process is now complete (no remaining active stages)
  const { data: remaining } = await sb
    .from('stage_instances')
    .select('id')
    .eq('process_instance_id', processInstance.id)
    .eq('status', 'active')

  const remainingCount = (remaining ?? []).length

  if (activatedStageIds.length === 0 && remainingCount === 0) {
    console.warn(
      `[completeStage] No outgoing transitions for stage ${si.stage_template_id} with final ${finalCode}, process auto-closed`
    )
  }

  let processCompleted = false
  let finish_reason: string | null = null

  if (remainingCount === 0) {
    if (finalCode === 'convert_to_applicant') finish_reason = 'converted'
    else if (finalCode === 'rejected') finish_reason = 'rejected'
    else if (finalCode === 'postponed') finish_reason = 'postponed'

    const { error: piErr } = await sb
      .from('process_instances')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status: 'completed', finish_reason, finished_at: now } as any)
      .eq('id', processInstance.id)
    if (piErr) throw piErr
    processCompleted = true

    if (finalCode === 'convert_to_applicant') {
      const { error: jErr } = await sb
        .from('education_journeys')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ education_status: 'applicant' } as any)
        .eq('id', processInstance.journey_id)
      if (jErr) throw jErr
    }
  }

  return {
    stage_instance_id: stageInstanceId,
    activated_stage_ids: activatedStageIds,
    process_completed: processCompleted,
    finish_reason,
  }
}
