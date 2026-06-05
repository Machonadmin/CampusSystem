import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { mapTaskTemplate } from '@/lib/workflow/start-process'
import type { StageTaskTemplateRow } from '@/types/database'

export async function POST(
  request: NextRequest,
  { params }: { params: { stageInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const body = await request.json() as {
      final_code: string
      result_data?: Record<string, unknown>
    }
    if (!body.final_code) {
      return NextResponse.json({ error: 'final_code обязателен' }, { status: 400 })
    }

    const sb = createServerClient()
    const now = new Date().toISOString()
    const actorId = session.person_id

    // 1. Load stage instance with template + process context
    const { data: si, error: siErr } = await sb
      .from('stage_instances')
      .select(`
        id, status, stage_template_id, process_instance_id,
        stage_template:stage_templates(id, code, has_tasks),
        process_instance:process_instances(id, journey_id, status)
      `)
      .eq('id', params.stageInstanceId)
      .maybeSingle()
    if (siErr) throw siErr
    if (!si) return NextResponse.json({ error: 'Подэтап не найден' }, { status: 404 })
    if (si.status !== 'active') {
      return NextResponse.json({ error: 'Подэтап не активен' }, { status: 400 })
    }

    const stageTemplate = si.stage_template as unknown as { id: string; code: string; has_tasks: boolean } | null
    const processInstance = si.process_instance as unknown as { id: string; journey_id: string; status: string } | null
    if (!stageTemplate || !processInstance) {
      return NextResponse.json({ error: 'Ошибка данных подэтапа' }, { status: 500 })
    }

    // 2. Mark stage as completed
    const { error: updateErr } = await sb
      .from('stage_instances')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        status: 'completed',
        final_code: body.final_code,
        completed_at: now,
        completed_by: actorId,
        result_data: body.result_data ?? {},
      } as any)
      .eq('id', params.stageInstanceId)
    if (updateErr) throw updateErr

    // 3. Complete all pending tasks for this stage
    const { error: taskErr } = await sb
      .from('tasks')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status: 'completed', completed_at: now } as any)
      .eq('stage_instance_id', params.stageInstanceId)
      .neq('status', 'completed')
      .neq('status', 'cancelled')
    if (taskErr) throw taskErr

    // 4. Find outgoing transitions for this stage + final_code
    const { data: transitions, error: trErr } = await sb
      .from('stage_transitions')
      .select('to_stage_template_id, activation_mode, trigger_final_code')
      .eq('from_stage_template_id', si.stage_template_id)
      .or(`trigger_final_code.eq.${body.final_code},trigger_final_code.is.null`)
      .order('sort_order', { ascending: true })
    if (trErr) throw trErr

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
        // after_all: every predecessor stage (all transitions TO this target) must be completed
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
            (p: { status: string }) => p.status === 'completed'
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: activateErr } = await sb
        .from('stage_instances')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: 'active', activated_at: now } as any)
        .eq('id', targetSi.id)
      if (activateErr) throw activateErr
      activatedStageIds.push(targetSi.id)

      // Create tasks if the newly activated stage has them
      const { data: targetTemplate } = await sb
        .from('stage_templates')
        .select('has_tasks')
        .eq('id', tr.to_stage_template_id)
        .maybeSingle()

      if (targetTemplate?.has_tasks && actorId) {
        const { data: taskTemplates } = await sb
          .from('stage_task_templates')
          .select('*')
          .eq('stage_template_id', tr.to_stage_template_id)
          .order('sort_order', { ascending: true })

        for (const tt of taskTemplates ?? []) {
          const insert = mapTaskTemplate(tt as unknown as StageTaskTemplateRow, targetSi.id, actorId)
          const { error: insertErr } = await sb
            .from('tasks')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .insert(insert as any)
          if (insertErr) throw insertErr
        }
      }
    }

    // 6. Check if process is now complete (no remaining active stages)
    const { data: remaining } = await sb
      .from('stage_instances')
      .select('id')
      .eq('process_instance_id', processInstance.id)
      .eq('status', 'active')

    let processCompleted = false
    if ((remaining ?? []).length === 0) {
      const finishReason =
        body.final_code === 'convert_to_applicant' ? 'converted' : body.final_code

      const { error: piErr } = await sb
        .from('process_instances')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: 'completed', finish_reason: finishReason, finished_at: now } as any)
        .eq('id', processInstance.id)
      if (piErr) throw piErr
      processCompleted = true

      if (body.final_code === 'convert_to_applicant') {
        const { error: jErr } = await sb
          .from('education_journeys')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ education_status: 'applicant' } as any)
          .eq('id', processInstance.journey_id)
        if (jErr) throw jErr
      }
    }

    return NextResponse.json({
      ok: true,
      stage_instance_id: params.stageInstanceId,
      activated_stage_ids: activatedStageIds,
      process_completed: processCompleted,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
