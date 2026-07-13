import { createServerClient } from '@/lib/supabase/server'

// ─── Автозадачи приёмной комиссии (напоминание + календарь) ──────────────────
//
// Этапы приёма ролевые (stage_templates.required_role_code), а задачи в системе
// назначаются на человека/отдел/должность — НЕ на роль. Поэтому «напоминание»
// реализуется в коде: при активации ролевого этапа каждому носителю нужной роли
// (с активным аккаунтом) создаётся личная задача с дедлайном на завтра. Задача
// автоматически появляется в «Мои задачи» и в личном календаре (тот читает
// tasks по assignee_id + due_date). Когда этап завершён — задача закрывается.
//
// Функция ИДЕМПОТЕНТНА: сверяет активные ролевые этапы с уже созданными задачами
// (metadata.source='acceptance'), добавляет недостающие и закрывает лишние.
// Движок complete_stage НЕ трогаем — синхронизацию вызывает route после RPC.

type SB = ReturnType<typeof createServerClient>

const OPEN_STATUSES = ['unassigned', 'pending', 'in_progress', 'review', 'declined']

// Названия этапов на иврите для заголовка задачи (основной язык учреждения).
const STAGE_TITLE_HE: Record<string, string> = {
  academic:       'בדיקה לימודית',
  dormitory:      'פנימייה',
  jewishness:     'בירור יהדות',
  medical:        'חוות דעת רפואית',
  final_approval: 'אישור סופי',
}

function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Носители любой из ролей, у кого есть активный аккаунт. */
async function resolveActivePersons(sb: SB, roleCodes: string[]): Promise<string[]> {
  if (roleCodes.length === 0) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: roleRows } = await sb.from('roles').select('id').in('code', roleCodes as any)
  const roleIds = (roleRows ?? []).map(r => r.id)
  if (roleIds.length === 0) return []

  const { data: prs } = await sb.from('person_roles').select('person_id').in('role_id', roleIds)
  const ids = [...new Set((prs ?? []).map(p => p.person_id))]
  if (ids.length === 0) return []

  const { data: accts } = await sb
    .from('person_accounts')
    .select('person_id')
    .in('person_id', ids)
    .eq('is_active', true)
  return [...new Set((accts ?? []).map(a => a.person_id))]
}

interface StageRow {
  id: string
  status: string
  stage_template: { code: string; required_role_code: string | null } | null
}
interface TaskRow {
  id: string
  status: string
  metadata: { stage_instance_id?: string } | null
}

/**
 * Сверяет автозадачи приёма для journey с текущим состоянием этапов.
 * Best-effort: бросать наружу нельзя — вызывается после успешного complete_stage
 * и не должен ронять завершение этапа. Ошибки логируются вызывающим кодом.
 */
export async function syncAcceptanceTasks(sb: SB, journeyId: string, actorId: string): Promise<void> {
  // 1. Инстансы процесса acceptance для journey.
  const { data: pis } = await sb
    .from('process_instances')
    .select('id, process_template:process_templates!inner(code)')
    .eq('journey_id', journeyId)
    .eq('process_template.code', 'acceptance')
  const instanceIds = (pis ?? []).map(p => p.id)
  if (instanceIds.length === 0) return

  // 2. Этапы этих инстансов.
  const { data: stagesRaw } = await sb
    .from('stage_instances')
    .select('id, status, stage_template:stage_templates!inner(code, required_role_code)')
    .in('process_instance_id', instanceIds)
  const stages = (stagesRaw ?? []) as unknown as StageRow[]

  const activeRoleStages = stages.filter(s => s.status === 'active' && s.stage_template?.required_role_code)
  const activeStageIds = new Set(activeRoleStages.map(s => s.id))

  // 3. Уже созданные автозадачи приёма по этому journey.
  const { data: existingRaw } = await sb
    .from('tasks')
    .select('id, status, metadata')
    .eq('module', 'education')
    .contains('metadata', { source: 'acceptance', journey_id: journeyId })
  const existing = (existingRaw ?? []) as unknown as TaskRow[]

  // 4. Закрываем задачи этапов, которые больше не активны.
  for (const task of existing) {
    const sid = task.metadata?.stage_instance_id
    if (sid && !activeStageIds.has(sid) && OPEN_STATUSES.includes(task.status)) {
      await sb.from('tasks')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: 'completed', completed_at: new Date().toISOString() } as any)
        .eq('id', task.id)
      await sb.from('task_status_history').insert({
        task_id: task.id, actor_id: actorId, from_status: task.status, to_status: 'completed',
        note: 'Этап приёма завершён',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    }
  }

  if (activeRoleStages.length === 0) return

  // 5. Создаём недостающие задачи для активных этапов.
  const coveredStageIds = new Set(
    existing.filter(t => OPEN_STATUSES.includes(t.status)).map(t => t.metadata?.stage_instance_id).filter(Boolean) as string[],
  )
  const toCreate = activeRoleStages.filter(s => !coveredStageIds.has(s.id))
  if (toCreate.length === 0) return

  // Имя абитуриентки — для заголовка (один раз).
  const { data: j } = await sb
    .from('education_journeys')
    .select('person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
    .eq('id', journeyId)
    .maybeSingle()
  const person = (j?.person as unknown as { full_name?: string | null; hebrew_name?: string | null } | null) ?? null
  const applicantName = person?.full_name || person?.hebrew_name || ''

  const due = tomorrowISO()

  for (const stage of toCreate) {
    const roleCodes = (stage.stage_template!.required_role_code ?? '').split(',').map(r => r.trim()).filter(Boolean)
    const personIds = await resolveActivePersons(sb, roleCodes)
    if (personIds.length === 0) continue

    const stageName = STAGE_TITLE_HE[stage.stage_template!.code] ?? stage.stage_template!.code
    const title = applicantName ? `חתימה — ${stageName}: ${applicantName}` : `חתימה — ${stageName}`

    for (const pid of personIds) {
      const { data: task, error } = await sb
        .from('tasks')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          title,
          module: 'education',
          metadata: { source: 'acceptance', journey_id: journeyId, stage_instance_id: stage.id, stage_code: stage.stage_template!.code },
          assignee_type: 'person',
          assignee_id: pid,
          creator_id: actorId,
          status: 'pending',
          priority: 'high',
          due_date: due,
          due_all_day: true,
        } as any)
        .select('id')
        .single()
      if (error || !task) continue
      await sb.from('task_status_history').insert({
        task_id: task.id, actor_id: actorId, from_status: null, to_status: 'pending',
        note: 'Автозадача этапа приёма',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    }
  }
}
