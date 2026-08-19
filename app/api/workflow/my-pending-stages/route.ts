import { flattenPhones } from '@/lib/persons/phone'
import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getSignatureMethod } from '@/lib/settings/app-settings'

/**
 * GET /api/workflow/my-pending-stages — личная очередь «Ожидают моей подписи».
 *
 * Возвращает активные ролевые этапы процесса «Приёмная комиссия», чью роль
 * (stage_templates.required_role_code, через запятую) несёт текущий
 * пользователь — с данными абитуриентки и финалами этапа, чтобы подписать
 * прямо из очереди (общий /api/workflow/stages/.../complete). Так каждый
 * подписант (учёба/общежитие/еврейство/директор) видит, кого он задерживает.
 *
 * Врачебный этап medical тоже ролевой — но у врача нет доступа к образованию,
 * поэтому он пользуется своей очередью /api/doctor/referrals; здесь medical
 * просто не совпадёт по роли у образовательных подписантов.
 */


export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })
    }

    const sb = createServerClient()

    // Активные ролевые этапы процесса acceptance.
    const { data: raw, error } = await sb
      .from('stage_instances')
      .select(`
        id, activated_at,
        stage_template:stage_templates!inner(id, code, name_ru, required_role_code, requires_signature),
        process_instance:process_instances!inner(id, journey_id, process_template:process_templates!inner(code))
      `)
      .eq('status', 'active')
      .eq('process_instance.process_template.code', 'acceptance')
      .order('activated_at', { ascending: true })
    if (error) throw error

    const stagesAll = (raw ?? []) as unknown as Array<{
      id: string
      activated_at: string | null
      stage_template: { id: string; code: string; name_ru: string; required_role_code: string | null; requires_signature: boolean } | null
      process_instance: { id: string; journey_id: string } | null
    }>

    // Оставляем только этапы, чью роль несёт пользователь (superadmin видит все).
    const isSuper = session.roles.includes('superadmin')
    const mine = stagesAll.filter(s => {
      const req = s.stage_template?.required_role_code
      if (!req) return false
      if (isSuper) return true
      const roles = req.split(',').map(r => r.trim()).filter(Boolean)
      return roles.some(r => session.roles.includes(r))
    })

    if (mine.length === 0) {
      const signature_method = await getSignatureMethod()
      return NextResponse.json({ stages: [], signature_method })
    }

    const journeyIds = [...new Set(mine.map(s => s.process_instance?.journey_id).filter(Boolean) as string[])]
    const templateIds = [...new Set(mine.map(s => s.stage_template?.id).filter(Boolean) as string[])]

    const [{ data: journeys }, { data: allFinals }, signature_method] = await Promise.all([
      sb.from('education_journeys')
        .select('id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, email, phones, photo_url)')
        .in('id', journeyIds),
      sb.from('stage_finals')
        .select('id, stage_template_id, code, name_ru, is_positive, sort_order')
        .in('stage_template_id', templateIds)
        .order('sort_order', { ascending: true }),
      getSignatureMethod(),
    ])

    const personByJourney = new Map<string, {
      full_name?: string | null; hebrew_name?: string | null
      email?: string | null; phones?: unknown; photo_url?: string | null
    }>()
    for (const j of (journeys ?? []) as unknown as Array<{ id: string; person: unknown }>) {
      personByJourney.set(j.id, (j.person as never) ?? {})
    }

    const finalsByTemplate = new Map<string, Array<{ id: string; code: string; name_ru: string; is_positive: boolean; sort_order: number }>>()
    for (const f of (allFinals ?? []) as Array<{ id: string; stage_template_id: string; code: string; name_ru: string; is_positive: boolean; sort_order: number }>) {
      const arr = finalsByTemplate.get(f.stage_template_id) ?? []
      arr.push({ id: f.id, code: f.code, name_ru: f.name_ru, is_positive: f.is_positive, sort_order: f.sort_order })
      finalsByTemplate.set(f.stage_template_id, arr)
    }

    const stages = mine.map(s => {
      const journeyId = s.process_instance?.journey_id ?? null
      const person = journeyId ? personByJourney.get(journeyId) : null
      const tmplId = s.stage_template?.id ?? ''
      return {
        stage_instance_id: s.id,
        activated_at: s.activated_at,
        journey_id: journeyId,
        stage_code: s.stage_template?.code ?? '',
        stage_name: s.stage_template?.name_ru ?? '',
        applicant: {
          full_name: person?.full_name ?? '',
          hebrew_name: person?.hebrew_name ?? null,
          email: person?.email ?? null,
          phones: flattenPhones(person?.phones),
          photo_url: person?.photo_url ?? null,
        },
        finals: finalsByTemplate.get(tmplId) ?? [],
      }
    })

    return NextResponse.json({ stages, signature_method })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
