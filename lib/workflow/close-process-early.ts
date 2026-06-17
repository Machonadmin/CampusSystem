import { createServerClient } from '@/lib/supabase/server'

type SB = ReturnType<typeof createServerClient>

export interface CloseProcessEarlyResult {
  process_instance_id: string
  final_code: string
  finish_reason: string
  journey_converted: boolean
}

/**
 * Маппинг финала подэтапа → причина завершения процесса.
 * Соответствует логике completeStage (convert_to_applicant→converted и т.д.),
 * но с дефолтом 'cancelled' для произвольных финалов.
 */
function mapFinishReason(finalCode: string): string {
  if (finalCode === 'convert_to_applicant') return 'converted'
  if (finalCode === 'rejected') return 'rejected'
  if (finalCode === 'postponed') return 'postponed'
  return 'cancelled'
}

/**
 * Досрочно закрывает экземпляр процесса целиком.
 *
 * В отличие от completeStage (который завершает один подэтап и двигает процесс
 * по переходам), здесь процесс закрывается принудительно: все незавершённые
 * подэтапы и задачи отменяются, статус процесса → 'completed' с finish_reason.
 *
 * Шаги:
 *   1. Загрузить process_instance (по id) с process_template_id и journey_id.
 *   2. Проверить status === 'active' (иначе ошибка 400 — процесс уже завершён).
 *   3. Найти финальный stage_template (MAX sort_order у этого process_template).
 *   4. Проверить, что finalCode среди stage_finals этого template (иначе 400).
 *   5. stage_instances этого процесса: active|waiting → 'skipped',
 *      completed_at=NOW(), completed_by=actorId.
 *   6. tasks этого процесса: unassigned|pending|in_progress|review → 'cancelled',
 *      completed_at=NOW().
 *   7. process_instance: status='completed', finish_reason, finished_at=NOW().
 *   8. Если finalCode === 'convert_to_applicant':
 *      education_journeys: education_status='applicant', application_date=NOW().
 *
 * Транзакций нет — частичное состояние при ошибке допустимо (как в startProcess).
 * Аудит (process_events) и finished_by не пишутся — отложено в бэклог.
 */
export async function closeProcessEarly(
  sb: SB,
  processInstanceId: string,
  finalCode: string,
  actorId: string | null,
): Promise<CloseProcessEarlyResult> {
  const now = new Date().toISOString()

  // 1. Загрузить process_instance
  const { data: pi, error: piErr } = await sb
    .from('process_instances')
    .select('id, status, process_template_id, journey_id')
    .eq('id', processInstanceId)
    .maybeSingle()
  if (piErr) throw piErr
  if (!pi) {
    throw Object.assign(new Error('Процесс не найден'), { status: 404 })
  }

  // 2. Процесс должен быть активным
  if (pi.status !== 'active') {
    throw Object.assign(new Error('Процесс уже завершён'), { status: 400 })
  }

  // 3. Финальный stage_template (MAX sort_order для этого process_template)
  const { data: stageTemplates, error: stErr } = await sb
    .from('stage_templates')
    .select('id, sort_order')
    .eq('process_template_id', pi.process_template_id)
    .order('sort_order', { ascending: false })
    .limit(1)
  if (stErr) throw stErr
  const finalStage = (stageTemplates ?? [])[0] as { id: string; sort_order: number } | undefined
  if (!finalStage) {
    throw Object.assign(new Error('У процесса нет этапов'), { status: 400 })
  }

  // 4. finalCode должен быть среди финалов последнего подэтапа
  const { data: finals, error: fErr } = await sb
    .from('stage_finals')
    .select('code')
    .eq('stage_template_id', finalStage.id)
  if (fErr) throw fErr
  const allowedCodes = (finals ?? []).map((f: { code: string }) => f.code)
  if (!allowedCodes.includes(finalCode)) {
    throw Object.assign(new Error('Недопустимый финал'), { status: 400 })
  }

  const finish_reason = mapFinishReason(finalCode)

  // 5. Отменить (skip) незавершённые подэтапы
  // Сначала соберём ID активных для event-записей
  const { data: activeStages } = await sb
    .from('stage_instances')
    .select('id')
    .eq('process_instance_id', pi.id)
    .in('status', ['active', 'waiting'])

  const { error: siErr } = await sb
    .from('stage_instances')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ status: 'skipped', completed_at: now, completed_by: actorId } as any)
    .eq('process_instance_id', pi.id)
    .in('status', ['active', 'waiting'])
  if (siErr) throw siErr

  // System events: stages cancelled on early close
  for (const s of activeStages ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: _evErr } = await sb.from('process_events').insert({
      stage_instance_id: s.id,
      event_type: 'system',
      content: 'Подэтап отменён',
      author_id: actorId,
      metadata: { reason: 'close_early', final_code: finalCode },
    } as any)
    void _evErr
  }

  // 6. Отменить незавершённые задачи всех подэтапов процесса.
  //    tasks не ссылаются напрямую на process_instance — идём через stage_instances.
  const { data: stageInstances, error: siListErr } = await sb
    .from('stage_instances')
    .select('id')
    .eq('process_instance_id', pi.id)
  if (siListErr) throw siListErr
  const stageInstanceIds = (stageInstances ?? []).map((s: { id: string }) => s.id)

  if (stageInstanceIds.length > 0) {
    const { error: taskErr } = await sb
      .from('tasks')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ status: 'cancelled', completed_at: now } as any)
      .in('stage_instance_id', stageInstanceIds)
      .in('status', ['unassigned', 'pending', 'in_progress', 'review'])
    if (taskErr) throw taskErr
  }

  // 7. Завершить процесс
  const { error: updErr } = await sb
    .from('process_instances')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ status: 'completed', finish_reason, finished_at: now } as any)
    .eq('id', pi.id)
  if (updErr) throw updErr

  // 8. Конверт лида в абитуриента
  let journey_converted = false
  if (finalCode === 'convert_to_applicant') {
    const { error: jErr } = await sb
      .from('education_journeys')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ education_status: 'applicant', application_date: now } as any)
      .eq('id', pi.journey_id)
    if (jErr) throw jErr
    journey_converted = true
  }

  return {
    process_instance_id: pi.id,
    final_code: finalCode,
    finish_reason,
    journey_converted,
  }
}
