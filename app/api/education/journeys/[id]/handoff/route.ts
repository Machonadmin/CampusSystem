import { flattenPhones } from '@/lib/persons/phone'
import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { journeyDeptTarget } from '@/lib/education/journey-target'

/**
 * GET /api/education/journeys/[id]/handoff — цель «Передать в приёмную комиссию».
 *
 * Находит АКТИВНЫЙ этап процесса «Набор», у шаблона которого есть финал
 * convert_to_applicant (т.е. этап, завершение которого превращает лида в
 * абитуриентку и запускает приём). Плюс проверяет обязательные поля лида и
 * возвращает { stage_instance_id, ready, missing }. Само действие делает
 * общий /api/workflow/stages/{sid}/complete (convert_to_applicant), чтобы не
 * дублировать пост-обработку (авто-старт приёма + задачи + уведомления).
 *
 * Право: view_leads (или superadmin). Конвертацию гейтит convert_lead в complete.
 */

const CONVERT_FINAL = 'convert_to_applicant'


export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()
    const allowed = session.roles.includes('superadmin')
      || await hasEducationPrivilege(session, 'view_leads', await journeyDeptTarget(sb, params.id))
    if (!allowed) return apiError('forbidden', 403)

    // Активный процесс «Набор» для journey.
    const { data: pis } = await sb
      .from('process_instances')
      .select('id, process_template:process_templates!inner(code)')
      .eq('journey_id', params.id)
      .eq('process_template.code', 'recruitment')
      .eq('status', 'active')
    const instanceIds = (pis ?? []).map(p => p.id)

    let stageInstanceId: string | null = null
    if (instanceIds.length > 0) {
      const { data: stages } = await sb
        .from('stage_instances')
        .select('id, stage_template_id, status')
        .in('process_instance_id', instanceIds)
        .eq('status', 'active')
      const stageList = (stages ?? []) as Array<{ id: string; stage_template_id: string | null; status: string }>
      const templateIds = [...new Set(stageList.map(s => s.stage_template_id).filter(Boolean) as string[])]
      if (templateIds.length > 0) {
        const { data: finals } = await sb
          .from('stage_finals')
          .select('stage_template_id')
          .eq('code', CONVERT_FINAL)
          .in('stage_template_id', templateIds)
        const convertTemplates = new Set((finals ?? []).map(f => f.stage_template_id))
        stageInstanceId = stageList.find(s => s.stage_template_id && convertTemplates.has(s.stage_template_id))?.id ?? null
      }
    }

    // Обязательные поля лида для передачи: имя + телефон.
    const { data: journey } = await sb
      .from('education_journeys')
      .select('person:persons!applicant_profiles_person_id_fkey(first_name, full_name, phones)')
      .eq('id', params.id)
      .maybeSingle()
    const person = (journey?.person as unknown as { first_name?: string | null; full_name?: string | null; phones?: unknown } | null) ?? null

    const missing: string[] = []
    if (!(person?.first_name?.trim() || person?.full_name?.trim())) missing.push('name')
    if (flattenPhones(person?.phones).length === 0) missing.push('phone')

    return NextResponse.json({
      stage_instance_id: stageInstanceId,
      ready: stageInstanceId != null && missing.length === 0,
      missing,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
