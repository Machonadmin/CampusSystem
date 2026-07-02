import { createServerClient } from '@/lib/supabase/server'
import type { StageTaskTemplateRow, TaskInsert } from '@/types/database'

type SB = ReturnType<typeof createServerClient>

export interface StartProcessResult {
  process_instance_id: string
  stage_instance_ids: string[]
  already_existed: boolean
}

/**
 * Преобразует шаблон задачи этапа в строку для вставки в tasks.
 * actorId здесь гарантированно не null (проверяется вызывающим кодом —
 * сейчас единственный вызывающий, completeStage, гарантирует это сам).
 *
 * Защита: если для department/position не задан соответствующий id —
 * откатываемся на 'unassigned', чтобы не нарушить CHECK tasks_assignee_consistency
 * и не уронить запуск процесса.
 */
export function mapTaskTemplate(
  tt: StageTaskTemplateRow,
  stageInstanceId: string,
  actorId: string,
  personFullName?: string,
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
    title: personFullName ? `${tt.title}: ${personFullName}` : tt.title,
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
    stage_task_template_id: tt.id,
  }
}

/**
 * Создаёт стартовые задачи подэтапа.
 *
 * Стартовые = те шаблоны, чей code есть среди to_task_code в task_transitions
 * с from_task_code IS NULL. Если для подэтапа нет ни одной такой transition
 * (legacy без настроенных переходов) — создаём все шаблоны (обратная
 * совместимость).
 */
export async function createStartingTasks(
  sb: SB,
  stageTemplateId: string,
  stageInstanceId: string,
  actorId: string,
  personFullName?: string,
): Promise<void> {
  const { data: taskTemplates, error: ttErr } = await sb
    .from('stage_task_templates')
    .select('*')
    .eq('stage_template_id', stageTemplateId)
    .order('sort_order', { ascending: true })
  if (ttErr) throw ttErr
  if (!taskTemplates || taskTemplates.length === 0) return

  const { data: startTransitions, error: trErr } = await sb
    .from('task_transitions')
    .select('to_task_code')
    .eq('stage_template_id', stageTemplateId)
    .is('from_task_code', null)
  if (trErr) throw trErr

  const startCodes = new Set(
    (startTransitions ?? []).map((t: { to_task_code: string }) => t.to_task_code)
  )

  // Нет настроенных стартовых переходов → создаём все (legacy fallback)
  const toCreate = startCodes.size > 0
    ? taskTemplates.filter((tt: StageTaskTemplateRow) => startCodes.has(tt.code))
    : taskTemplates

  for (const tt of toCreate) {
    const insert = mapTaskTemplate(tt as unknown as StageTaskTemplateRow, stageInstanceId, actorId, personFullName)
    const { error: taskErr } = await sb
      .from('tasks')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insert as any)
    if (taskErr) throw taskErr
  }
}
