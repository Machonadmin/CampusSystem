import { flattenPhones } from '@/lib/persons/phone'
import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege, getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'
import { getSignatureMethod } from '@/lib/settings/app-settings'

/**
 * GET /api/education/acceptance-overview?status=active|completed|all
 *
 * Панель руководителя приёмной комиссии: все абитуриентки с процессом
 * acceptance и их этапы (статус, решение, подписант, заметка) — чтобы видеть
 * всю картину одним экраном. Для этапов, которые текущий пользователь вправе
 * подписать (его роль + этап активен), возвращаются финалы + can_sign, чтобы
 * подписать прямо из обзора.
 *
 * Право: view_applicants (любой scope) или superadmin.
 */


export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })

    const isSuper = session.roles.includes('superadmin')
    const allowed = isSuper || await hasEducationPrivilege(session, 'view_applicants')
    if (!allowed) return NextResponse.json({ error: serverT('forbidden') }, { status: 403 })

    // Ограничение по подразделению: scope='all'/superadmin — весь институт;
    // scope='department' — только свои подразделения.
    const scope = isSuper ? 'all' : await getEducationPrivilegeScope(session, 'view_applicants')
    const myDepts = scope === 'department' ? await getUserDepartmentIds(session.person_id) : []

    const statusFilter = (request.nextUrl.searchParams.get('status') ?? 'active').trim()

    const sb = createServerClient()

    // Инстансы процесса acceptance (+ фильтр статуса + journey/person).
    let piQuery = sb
      .from('process_instances')
      .select(`
        id, status, journey_id,
        process_template:process_templates!inner(code),
        journey:education_journeys!inner(id, education_status, primary_department_id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name, photo_url, phones))
      `)
      .eq('process_template.code', 'acceptance')
      .order('started_at', { ascending: false })
    if (statusFilter === 'active') piQuery = piQuery.eq('status', 'active')
    // «Завершённые» = процессы status='completed' И успешно принятые: движок
    // кодирует приём как status='cancelled' + finish_reason admitted(_conditional),
    // поэтому без этого условия принятые абитуриентки пропадали из вкладки.
    else if (statusFilter === 'completed') {
      piQuery = piQuery.or('status.eq.completed,and(status.eq.cancelled,finish_reason.in.(admitted,admitted_conditional))')
    }

    const { data: pisRaw, error: piErr } = await piQuery
    if (piErr) throw piErr

    let pis = (pisRaw ?? []) as unknown as Array<{
      id: string; status: string; journey_id: string
      journey: { id: string; education_status: string | null; primary_department_id: string | null; person: unknown } | null
    }>

    // department-scope: только journey своих подразделений.
    if (scope === 'department') {
      pis = pis.filter(p => {
        const jd = p.journey?.primary_department_id ?? null
        return jd != null && myDepts.includes(jd)
      })
    }

    const signature_method = await getSignatureMethod()

    if (pis.length === 0) {
      return NextResponse.json({ applicants: [], signature_method })
    }

    const instanceIds = pis.map(p => p.id)

    // Этапы всех инстансов.
    const { data: stagesRaw } = await sb
      .from('stage_instances')
      .select(`
        id, process_instance_id, status, final_code, notes,
        stage_template:stage_templates!inner(id, code, name_ru, sort_order, required_role_code)
      `)
      .in('process_instance_id', instanceIds)
    const stages = (stagesRaw ?? []) as unknown as Array<{
      id: string; process_instance_id: string; status: string; final_code: string | null; notes: string | null
      stage_template: { id: string; code: string; name_ru: string; sort_order: number; required_role_code: string | null } | null
    }>

    // Подписи (имя подписанта) + финалы для ролевых шаблонов.
    const stageIds = stages.map(s => s.id)
    const templateIds = [...new Set(stages.map(s => s.stage_template?.id).filter(Boolean) as string[])]

    const [{ data: sigs }, { data: finalsRaw }] = await Promise.all([
      stageIds.length > 0
        ? sb.from('stage_signatures').select('stage_instance_id, signer_name, final_code, signed_at').in('stage_instance_id', stageIds).order('signed_at', { ascending: true })
        : Promise.resolve({ data: [] as Array<{ stage_instance_id: string; signer_name: string; final_code: string | null; signed_at: string }> }),
      templateIds.length > 0
        ? sb.from('stage_finals').select('id, stage_template_id, code, name_ru, is_positive, sort_order').in('stage_template_id', templateIds).order('sort_order', { ascending: true })
        : Promise.resolve({ data: [] as Array<{ id: string; stage_template_id: string; code: string; name_ru: string; is_positive: boolean; sort_order: number }> }),
    ])

    const signerByStage = new Map<string, string>()
    for (const s of (sigs ?? []) as Array<{ stage_instance_id: string; signer_name: string | null }>) {
      if (s.signer_name) signerByStage.set(s.stage_instance_id, s.signer_name)
    }
    const finalsByTemplate = new Map<string, Array<{ id: string; code: string; name_ru: string; is_positive: boolean; sort_order: number }>>()
    for (const f of (finalsRaw ?? []) as Array<{ id: string; stage_template_id: string; code: string; name_ru: string; is_positive: boolean; sort_order: number }>) {
      const arr = finalsByTemplate.get(f.stage_template_id) ?? []
      arr.push({ id: f.id, code: f.code, name_ru: f.name_ru, is_positive: f.is_positive, sort_order: f.sort_order })
      finalsByTemplate.set(f.stage_template_id, arr)
    }

    const stagesByInstance = new Map<string, typeof stages>()
    for (const s of stages) {
      const arr = stagesByInstance.get(s.process_instance_id) ?? []
      arr.push(s)
      stagesByInstance.set(s.process_instance_id, arr)
    }

    function canSign(requiredRole: string | null, status: string): boolean {
      if (status !== 'active' || !requiredRole) return false
      if (isSuper) return true
      const roles = requiredRole.split(',').map(r => r.trim()).filter(Boolean)
      return roles.some(r => session!.roles.includes(r))
    }

    const applicants = pis.map(pi => {
      const person = (pi.journey?.person as unknown as { full_name?: string | null; hebrew_name?: string | null; photo_url?: string | null; phones?: unknown } | null) ?? null
      const rows = (stagesByInstance.get(pi.id) ?? [])
        .filter(s => s.stage_template?.required_role_code) // только ролевые этапы приёма
        .sort((a, b) => (a.stage_template?.sort_order ?? 0) - (b.stage_template?.sort_order ?? 0))
        .map(s => {
          const templateId = s.stage_template?.id ?? ''
          const signable = canSign(s.stage_template?.required_role_code ?? null, s.status)
          return {
            stage_instance_id: s.id,
            stage_code: s.stage_template?.code ?? '',
            stage_name: s.stage_template?.name_ru ?? '',
            required_role_code: s.stage_template?.required_role_code ?? null,
            status: s.status,
            final_code: s.final_code,
            note: s.notes ?? null,
            signer_name: signerByStage.get(s.id) ?? null,
            can_sign: signable,
            finals: signable ? (finalsByTemplate.get(templateId) ?? []) : [],
          }
        })
      return {
        journey_id: pi.journey_id,
        process_instance_id: pi.id,
        process_status: pi.status,
        education_status: pi.journey?.education_status ?? null,
        applicant: {
          full_name: person?.full_name ?? '',
          hebrew_name: person?.hebrew_name ?? null,
          photo_url: person?.photo_url ?? null,
          phones: flattenPhones(person?.phones),
        },
        stages: rows,
      }
    })

    return NextResponse.json({ applicants, signature_method })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
