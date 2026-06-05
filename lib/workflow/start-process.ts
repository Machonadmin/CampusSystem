import { createServerClient } from '@/lib/supabase/server'
import type { StageTaskTemplateRow, TaskInsert } from '@/types/database'

type SB = ReturnType<typeof createServerClient>

export interface StartProcessResult {
  process_instance_id: string
  stage_instance_ids: string[]
  already_existed: boolean
}

/**
 * Запускает экземпляр процесса для journey по коду шаблона.
 *
 * Шаги:
 *   1. Найти process_template по code.
 *   2. Идемпотентность: если у journey уже есть активный экземпляр этого
 *      шаблона — вернуть его (ничего не создавая).
 *   3. Определить начальные этапы (transitions с from_stage_template_id IS NULL).
 *   4. Если у начального этапа has_tasks=true, а actorId=null — бросить ошибку
 *      (нельзя создать задачи без автора: tasks.creator_id NOT NULL).
 *   5. Создать process_instance (status='active').
 *   6. Создать stage_instance (status='active') для каждого начального этапа.
 *   7. Для этапов с has_tasks=true — создать задачи из stage_task_templates.
 *
 * Маппинг default_assignee_type → tasks:
 *   creator    → person     + assignee_id=actorId          + status='pending'
 *   department → department + department_id=default_dept   + status='unassigned'
 *   position   → position   + position_id=default_position + status='unassigned'
 *   role/manual/null/прочее → unassigned (всё null)        + status='unassigned'
 *
 * Транзакций нет — частичное состояние при ошибке допустимо (как в этапе 2A).
 */
export async function startProcess(
  sb: SB,
  processCode: string,
  journeyId: string,
  actorId: string | null,
): Promise<StartProcessResult> {
  // 1. Шаблон процесса
  const { data: template, error: tErr } = await sb
    .from('process_templates')
    .select('id')
    .eq('code', processCode)
    .maybeSingle()
  if (tErr) throw tErr
  if (!template) throw new Error(`Шаблон процесса «${processCode}» не найден`)

  // 2. Идемпотентность — уже есть активный экземпляр?
  const { data: existing, error: exErr } = await sb
    .from('process_instances')
    .select('id')
    .eq('journey_id', journeyId)
    .eq('process_template_id', template.id)
    .eq('status', 'active')
    .maybeSingle()
  if (exErr) throw exErr
  if (existing) {
    return { process_instance_id: existing.id, stage_instance_ids: [], already_existed: true }
  }

  // 3. Этапы процесса + начальные этапы (from_stage_template_id IS NULL)
  const { data: stages, error: sErr } = await sb
    .from('stage_templates')
    .select('id, has_tasks, sort_order')
    .eq('process_template_id', template.id)
  if (sErr) throw sErr
  type StageInfo = { id: string; has_tasks: boolean; sort_order: number }
  const stageMap = new Map<string, StageInfo>(
    (stages ?? []).map((s: StageInfo) => [s.id, s])
  )
  const stageIds = (stages ?? []).map((s: StageInfo) => s.id)
  if (stageIds.length === 0) throw new Error('У процесса нет этапов')

  const { data: initTransitions, error: trErr } = await sb
    .from('stage_transitions')
    .select('to_stage_template_id')
    .is('from_stage_template_id', null)
    .in('to_stage_template_id', stageIds)
  if (trErr) throw trErr

  // Уникальные id начальных этапов, упорядоченные по sort_order этапа
  const transitionTargets: string[] = (initTransitions ?? []).map(
    (t: { to_stage_template_id: string }) => t.to_stage_template_id
  )
  const initialStageIds: string[] = [...new Set(transitionTargets)]
    .sort((a, b) => (stageMap.get(a)?.sort_order ?? 0) - (stageMap.get(b)?.sort_order ?? 0))

  if (initialStageIds.length === 0) throw new Error('У процесса нет начальных этапов')

  // 4. Проверка автора для этапов с задачами
  const anyInitialHasTasks = initialStageIds.some(id => stageMap.get(id)?.has_tasks)
  if (anyInitialHasTasks && !actorId) {
    throw new Error('Нельзя запустить процесс с задачами без автора (actorId=null)')
  }

  const now = new Date().toISOString()

  // 5. process_instance
  const { data: pi, error: piErr } = await sb
    .from('process_instances')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({
      process_template_id: template.id,
      journey_id: journeyId,
      status: 'active',
      created_by: actorId,
    } as any)
    .select('id')
    .single()
  if (piErr || !pi) throw piErr ?? new Error('Ошибка создания process_instance')

  // 6–7. stage_instances + задачи (все подэтапы: active + waiting)
  const stageInstanceIds: string[] = []
  const initialSet = new Set(initialStageIds)
  const allStages = [...stageMap.values()].sort((a, b) => a.sort_order - b.sort_order)

  for (const stage of allStages) {
    const isActive = initialSet.has(stage.id)
    const { data: si, error: siErr } = await sb
      .from('stage_instances')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        process_instance_id: pi.id,
        stage_template_id: stage.id,
        status: isActive ? 'active' : 'waiting',
        activated_at: isActive ? now : null,
      } as any)
      .select('id')
      .single()
    if (siErr || !si) throw siErr ?? new Error('Ошибка создания stage_instance')
    stageInstanceIds.push(si.id)

    if (!isActive || !stage.has_tasks) continue

    const { data: taskTemplates, error: ttErr } = await sb
      .from('stage_task_templates')
      .select('*')
      .eq('stage_template_id', stage.id)
      .order('sort_order', { ascending: true })
    if (ttErr) throw ttErr

    for (const tt of taskTemplates ?? []) {
      const insert = mapTaskTemplate(tt, si.id, actorId!)
      const { error: taskErr } = await sb
        .from('tasks')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(insert as any)
      if (taskErr) throw taskErr
    }
  }

  return { process_instance_id: pi.id, stage_instance_ids: stageInstanceIds, already_existed: false }
}

/**
 * Преобразует шаблон задачи этапа в строку для вставки в tasks.
 * actorId здесь гарантированно не null (проверено в startProcess для этапов
 * с задачами).
 *
 * Защита: если для department/position не задан соответствующий id —
 * откатываемся на 'unassigned', чтобы не нарушить CHECK tasks_assignee_consistency
 * и не уронить запуск процесса.
 */
export function mapTaskTemplate(
  tt: StageTaskTemplateRow,
  stageInstanceId: string,
  actorId: string,
): TaskInsert {
  let assignee_type: TaskInsert['assignee_type'] = 'unassigned'
  let assignee_id: string | null = null
  let department_id: string | null = null
  let position_id: string | null = null
  let status: TaskInsert['status'] = 'unassigned'

  if (tt.default_assignee_type === 'creator') {
    assignee_type = 'person'
    assignee_id = actorId
    status = 'pending'
  } else if (tt.default_assignee_type === 'department' && tt.default_department_id) {
    assignee_type = 'department'
    department_id = tt.default_department_id
    status = 'unassigned'
  } else if (tt.default_assignee_type === 'position' && tt.default_position_id) {
    assignee_type = 'position'
    position_id = tt.default_position_id
    status = 'unassigned'
  }
  // role / manual / null / department без отдела / position без должности → unassigned

  return {
    title: tt.title,
    description: tt.description,
    module: 'general',
    metadata: {},
    assignee_type,
    assignee_id,
    department_id,
    position_id,
    creator_id: actorId,
    status,
    priority: tt.default_priority,
    due_date: null,
    due_time: null,
    due_all_day: true,
    stage_instance_id: stageInstanceId,
  }
}
