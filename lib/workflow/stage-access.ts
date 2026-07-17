import type { SessionPayload } from '@/lib/auth/jwt'
import { createServerClient } from '@/lib/supabase/server'
import { hasEducationPrivilege } from '@/lib/education/permissions'

// ─── Контекст этапа + композиция прав на завершение/подпись ──────────────────

export interface StageContext {
  stageInstanceId:   string
  stageTemplateId:   string | null
  stageCode:         string | null
  requiredRoleCode:  string | null
  requiresSignature: boolean
  journeyId:         string | null
  departmentId:      string | null
}

/** Загружает шаблон этапа (роль/подпись) + journey/подразделение для проверки прав. */
export async function loadStageContext(stageInstanceId: string): Promise<StageContext | null> {
  const sb = createServerClient()
  const { data: si } = await sb
    .from('stage_instances')
    .select(`
      id,
      stage_template:stage_templates(id, code, required_role_code, requires_signature),
      process_instance:process_instances(journey_id)
    `)
    .eq('id', stageInstanceId)
    .maybeSingle()
  if (!si) return null

  const tmpl = si.stage_template as unknown as
    { id: string; code: string | null; required_role_code: string | null; requires_signature: boolean } | null
  const journeyId = (si.process_instance as unknown as { journey_id: string } | null)?.journey_id ?? null

  let departmentId: string | null = null
  if (journeyId) {
    const { data: j } = await sb
      .from('education_journeys')
      .select('primary_department_id')
      .eq('id', journeyId)
      .maybeSingle()
    departmentId = j?.primary_department_id ?? null
  }

  return {
    stageInstanceId,
    stageTemplateId:   tmpl?.id ?? null,
    stageCode:         tmpl?.code ?? null,
    requiredRoleCode:  tmpl?.required_role_code ?? null,
    requiresSignature: !!tmpl?.requires_signature,
    journeyId,
    departmentId,
  }
}

/**
 * Кто и в каком качестве вправе завершить/подписать этап.
 *  - Этап с required_role_code: подписант с этой ролью → 'role'; управленец с
 *    manage_leads (в т.ч. superadmin) → 'override'. Это ЗАМЕНЯЕТ требование
 *    manage_leads для ролевых этапов приёма (иначе новые роли не смогли бы
 *    дойти до завершения — см. ревью дизайна).
 *  - Этап без роли (все существующие): прежнее поведение — нужен manage_leads.
 * Возвращает 'role' | 'override' | null (нет прав).
 */
export async function stageSignerAuthority(
  session: SessionPayload,
  ctx: StageContext,
): Promise<'role' | 'override' | null> {
  if (ctx.requiredRoleCode) {
    // Ролевой этап (приёмная комиссия): подписывает ТОЛЬКО носитель нужной роли.
    // required_role_code может перечислять несколько ролей ('doctor,psychologist')
    // — достаточно любой из них.
    const required = ctx.requiredRoleCode.split(',').map(r => r.trim()).filter(Boolean)
    if (required.some(r => session.roles.includes(r))) return 'role'
    // Override — только для superadmin (аварийный/админский случай). НЕ manage_leads,
    // иначе набор/куратор могли бы подписывать чужие этапы (баг: гиюс трогал приём,
    // комендант — этап еврейства).
    if (session.roles.includes('superadmin')) return 'override'
    return null
  }
  // Не-ролевой этап (набор): прежнее поведение — нужен manage_leads.
  const target = ctx.departmentId ? { department_id: ctx.departmentId } : undefined
  const hasManage = await hasEducationPrivilege(session, 'manage_leads', target)
  return hasManage ? 'role' : null
}
