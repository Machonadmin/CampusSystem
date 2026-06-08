import { createServerClient } from '@/lib/supabase/server'
import { createStartingTasks } from '@/lib/workflow/start-process'

type SB = ReturnType<typeof createServerClient>

/**
 * Возвращает пропущенный (skipped) подэтап к выполнению.
 *
 * Сценарий: лид прошёл предыдущий подэтап с финалом, который пропустил
 * следующий (например, 'done_event_skip' → Мероприятие = skipped). Пользователь
 * хочет всё-таки выполнить пропущенный подэтап.
 *
 * Шаги:
 *   1. Загрузить stage_instance + процесс. Проверки:
 *      - status === 'skipped' (иначе Error)
 *      - process.status === 'active' (иначе Error)
 *   2. UPDATE stage_instance: status='active', completed_at/by=NULL, final_code=NULL.
 *   3. Создать стартовые задачи подэтапа (createStartingTasks) с ФИО лида в title.
 *
 * actorId гарантированно не null (берётся из сессии в API).
 */
export async function reactivateStage(
  sb: SB,
  stageInstanceId: string,
  actorId: string,
): Promise<void> {
  // 1. Загрузка stage_instance + контекст процесса
  const { data: si, error: siErr } = await sb
    .from('stage_instances')
    .select(`
      id, status, stage_template_id,
      process_instance:process_instances(id, status, journey_id)
    `)
    .eq('id', stageInstanceId)
    .maybeSingle()
  if (siErr) throw siErr
  if (!si) {
    throw Object.assign(new Error('Подэтап не найден'), { status: 404 })
  }

  const processInstance = si.process_instance as unknown as
    { id: string; status: string; journey_id: string } | null
  if (!processInstance) {
    throw new Error('Ошибка данных подэтапа')
  }

  if (si.status !== 'skipped') {
    throw Object.assign(
      new Error('Активировать можно только пропущенный подэтап'),
      { status: 400 },
    )
  }
  if (processInstance.status !== 'active') {
    throw Object.assign(
      new Error('Процесс уже завершён — подэтап нельзя активировать'),
      { status: 400 },
    )
  }

  const now = new Date().toISOString()

  // 2. Вернуть подэтап в активное состояние
  const { error: updateErr } = await sb
    .from('stage_instances')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({
      status: 'active',
      activated_at: now,
      completed_at: null,
      completed_by: null,
      final_code: null,
    } as any)
    .eq('id', stageInstanceId)
  if (updateErr) throw updateErr

  // 3. ФИО лида — подставляется в title задач
  let personFullName: string | undefined
  {
    const { data: journeyPerson } = await sb
      .from('education_journeys')
      .select('person:persons!education_journeys_person_id_fkey(full_name)')
      .eq('id', processInstance.journey_id)
      .maybeSingle()
    const p = (journeyPerson?.person as unknown as { full_name: string | null } | null)
    personFullName = p?.full_name ?? undefined
  }

  // 4. Создать стартовые задачи подэтапа (createStartingTasks сам выйдет,
  //    если у подэтапа нет шаблонов задач).
  await createStartingTasks(sb, si.stage_template_id, stageInstanceId, actorId, personFullName)
}
