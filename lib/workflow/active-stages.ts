import { createServerClient } from '@/lib/supabase/server'

type Sb = ReturnType<typeof createServerClient>

export interface ActiveStageWithTasks {
  stage_name: string
  tasks: string[]
}

/**
 * Активные подэтапы процессов journey с их открытыми задачами —
 * данные колонки «Текущий этап и задачи» в списках (лиды, абитуриенты).
 *
 * Для каждого journey из journeyIds: активные process_instances →
 * их активные stage_instances → незакрытые задачи этих подэтапов.
 * Каждый journey гарантированно присутствует в результате (пустой массив,
 * если активных подэтапов нет).
 */
export async function getActiveStagesWithTasks(
  sb: Sb,
  journeyIds: string[],
): Promise<Map<string, ActiveStageWithTasks[]>> {
  const result = new Map<string, ActiveStageWithTasks[]>()
  for (const id of journeyIds) result.set(id, [])
  if (journeyIds.length === 0) return result

  const { data: instances } = await sb
    .from('process_instances')
    .select('id, journey_id')
    .in('journey_id', journeyIds)
    .eq('status', 'active')

  const piToJourney = new Map<string, string>()
  for (const pi of instances ?? []) {
    piToJourney.set(pi.id as string, pi.journey_id as string)
  }
  if (piToJourney.size === 0) return result

  const { data: stageInstances } = await sb
    .from('stage_instances')
    .select('id, process_instance_id, stage_template:stage_templates(name_ru)')
    .in('process_instance_id', [...piToJourney.keys()])
    .eq('status', 'active')

  const siToEntry = new Map<string, ActiveStageWithTasks>()
  for (const si of stageInstances ?? []) {
    const journeyId = piToJourney.get(si.process_instance_id as string)
    if (!journeyId) continue
    const name = (si.stage_template as unknown as { name_ru: string } | null)?.name_ru
    if (!name) continue
    const entry: ActiveStageWithTasks = { stage_name: name, tasks: [] }
    siToEntry.set(si.id as string, entry)
    result.get(journeyId)!.push(entry)
  }

  if (siToEntry.size > 0) {
    const { data: tasks } = await sb
      .from('tasks')
      .select('title, stage_instance_id')
      .in('stage_instance_id', [...siToEntry.keys()])
      .in('status', ['unassigned', 'pending', 'in_progress'])

    for (const t of tasks ?? []) {
      siToEntry.get(t.stage_instance_id as string)?.tasks.push(t.title as string)
    }
  }

  return result
}
