import { createServerClient } from '@/lib/supabase/server'
import { mapTaskTemplate } from '@/lib/workflow/start-process'
import type { StageTaskTemplateRow } from '@/types/database'

type SB = ReturnType<typeof createServerClient>

/**
 * Обрабатывает завершение задачи: активирует следующие задачи подэтапа
 * по правилам task_transitions.
 *
 * Шаги:
 *   1. Загрузить задачу + её шаблон (stage_task_template_id → code,
 *      stage_template_id). Если шаблона нет (legacy) — выйти.
 *   2. Найти исходящие transitions: from_task_code = code завершённой задачи.
 *   3. Для каждого to_task_code:
 *      a. Пропустить, если задача с этим шаблоном уже есть в stage_instance
 *         (идемпотентность / не дублировать после after_all из разных веток).
 *      b. after_one → создать сразу.
 *      c. after_all → создать только если ВСЕ предшественники (все from_task_code,
 *         ведущие к этому to_task_code) завершены в этом stage_instance.
 *
 * Транзакций нет — частичное состояние при ошибке допустимо (как в остальном
 * workflow-движке).
 *
 * actorId не может быть null: задачи создаются с creator_id NOT NULL.
 */
export async function handleTaskCompletion(
  sb: SB,
  taskId: string,
  actorId: string,
): Promise<void> {
  // 1. Задача + её шаблон
  const { data: task, error: tErr } = await sb
    .from('tasks')
    .select(`
      id, stage_instance_id, stage_task_template_id,
      template:stage_task_templates!tasks_stage_task_template_id_fkey(id, code, stage_template_id)
    `)
    .eq('id', taskId)
    .maybeSingle()
  if (tErr) throw tErr
  if (!task) return

  const template = task.template as unknown as
    { id: string; code: string; stage_template_id: string } | null
  // Legacy-задача без шаблона или задача вне подэтапа — переходов нет
  if (!template || !task.stage_instance_id) return

  const stageInstanceId = task.stage_instance_id as string
  const stageTemplateId = template.stage_template_id

  // 2. Исходящие переходы от завершённой задачи
  const { data: transitions, error: trErr } = await sb
    .from('task_transitions')
    .select('to_task_code, activation_mode')
    .eq('stage_template_id', stageTemplateId)
    .eq('from_task_code', template.code)
    .order('sort_order', { ascending: true })
  if (trErr) throw trErr
  if (!transitions || transitions.length === 0) return

  // Шаблоны задач этого подэтапа (code → шаблон)
  const { data: templates, error: ttErr } = await sb
    .from('stage_task_templates')
    .select('*')
    .eq('stage_template_id', stageTemplateId)
  if (ttErr) throw ttErr
  const templateByCode = new Map<string, StageTaskTemplateRow>(
    (templates ?? []).map((t: StageTaskTemplateRow) => [t.code, t])
  )

  const seen = new Set<string>()
  for (const tr of transitions) {
    const toCode = tr.to_task_code as string
    if (seen.has(toCode)) continue
    seen.add(toCode)

    const targetTemplate = templateByCode.get(toCode)
    if (!targetTemplate) continue  // нет шаблона под этот code — пропуск

    // a. Уже есть задача с этим шаблоном в этом stage_instance?
    const { data: existing, error: exErr } = await sb
      .from('tasks')
      .select('id')
      .eq('stage_instance_id', stageInstanceId)
      .eq('stage_task_template_id', targetTemplate.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (existing) continue

    // b/c. Режим активации
    if (tr.activation_mode === 'after_all') {
      // Все предшественники (from_task_code → toCode) должны быть завершены
      const { data: incoming, error: inErr } = await sb
        .from('task_transitions')
        .select('from_task_code')
        .eq('stage_template_id', stageTemplateId)
        .eq('to_task_code', toCode)
      if (inErr) throw inErr

      const predecessorCodes = (incoming ?? [])
        .map((t: { from_task_code: string | null }) => t.from_task_code)
        .filter((c): c is string => c !== null)

      if (predecessorCodes.length > 0) {
        const predecessorTemplateIds = predecessorCodes
          .map(c => templateByCode.get(c)?.id)
          .filter((id): id is string => Boolean(id))

        const { data: predTasks, error: pErr } = await sb
          .from('tasks')
          .select('status')
          .eq('stage_instance_id', stageInstanceId)
          .in('stage_task_template_id', predecessorTemplateIds)
        if (pErr) throw pErr

        // Все предшественники должны существовать и быть завершены
        const allDone =
          predecessorTemplateIds.length > 0 &&
          (predTasks ?? []).length >= predecessorTemplateIds.length &&
          (predTasks ?? []).every((p: { status: string }) => p.status === 'completed')

        if (!allDone) continue
      }
    }

    // Создать задачу
    const insert = mapTaskTemplate(targetTemplate, stageInstanceId, actorId)
    const { error: insErr } = await sb
      .from('tasks')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insert as any)
    if (insErr) throw insErr
  }
}
