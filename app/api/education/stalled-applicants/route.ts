import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege, getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'

/**
 * GET /api/education/stalled-applicants?days=N
 *
 * Абитуриентки, чей этап приёма «завис»: этап процесса acceptance активен и
 * ждёт (activated_at) дольше N дней (по умолчанию 7). Чтобы руководитель видел,
 * кого именно задерживают, и никто не выпал из процесса. Сгруппировано по
 * journey: имя + список зависших этапов + максимальная давность (дней).
 *
 * Право: view_applicants (любой scope) или superadmin. Иначе — пустой список
 * (виджет просто не показывается).
 */

interface StalledStage { stage_code: string; stage_name: string; days: number; role_code: string | null }
interface StalledApplicant {
  journey_id: string
  applicant: { full_name: string; hebrew_name: string | null; photo_url: string | null }
  stages: StalledStage[]
  max_days: number
}

function daysSince(iso: string | null, nowMs: number): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.floor((nowMs - t) / 86400000)
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })

    const isSuper = session.roles.includes('superadmin')
    const allowed = isSuper || await hasEducationPrivilege(session, 'view_applicants')
    if (!allowed) return NextResponse.json({ applicants: [] })

    // Ограничение по подразделению: scope='all'/superadmin — весь институт;
    // scope='department' — только свои подразделения (фильтр ниже по journey).
    const scope = isSuper ? 'all' : await getEducationPrivilegeScope(session, 'view_applicants')
    const myDepts = scope === 'department' ? await getUserDepartmentIds(session.person_id) : []

    const daysParam = parseInt(request.nextUrl.searchParams.get('days') ?? '7', 10)
    const days = Number.isFinite(daysParam) && daysParam >= 0 ? daysParam : 7
    const nowMs = Date.now()
    const cutoff = new Date(nowMs - days * 86400000).toISOString()

    const sb = createServerClient()

    // Активные ролевые этапы acceptance, ждущие дольше порога (или без метки времени).
    const { data: raw, error } = await sb
      .from('stage_instances')
      .select(`
        id, activated_at,
        stage_template:stage_templates!inner(code, name_ru, required_role_code, requires_signature),
        process_instance:process_instances!inner(journey_id, status, process_template:process_templates!inner(code))
      `)
      .eq('status', 'active')
      .eq('process_instance.status', 'active')
      .eq('process_instance.process_template.code', 'acceptance')
      .lt('activated_at', cutoff)
      .order('activated_at', { ascending: true })
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ applicants: [] })
      throw error
    }

    const stages = (raw ?? []) as unknown as Array<{
      id: string
      activated_at: string | null
      stage_template: { code: string; name_ru: string; required_role_code: string | null; requires_signature: boolean } | null
      process_instance: { journey_id: string; status: string } | null
    }>

    // Только ролевые этапы приёма (у которых есть подписант).
    const relevant = stages.filter(s => s.stage_template?.required_role_code)
    if (relevant.length === 0) return NextResponse.json({ applicants: [] })

    const journeyIds = [...new Set(relevant.map(s => s.process_instance?.journey_id).filter(Boolean) as string[])]

    const { data: journeys } = await sb
      .from('education_journeys')
      .select('id, primary_department_id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name, photo_url)')
      .in('id', journeyIds)

    const personByJourney = new Map<string, { full_name?: string | null; hebrew_name?: string | null; photo_url?: string | null }>()
    const deptByJourney = new Map<string, string | null>()
    for (const j of (journeys ?? []) as unknown as Array<{ id: string; primary_department_id: string | null; person: unknown }>) {
      personByJourney.set(j.id, (j.person as never) ?? {})
      deptByJourney.set(j.id, j.primary_department_id ?? null)
    }

    const byJourney = new Map<string, StalledApplicant>()
    for (const s of relevant) {
      const journeyId = s.process_instance?.journey_id
      if (!journeyId) continue
      // department-scope: показываем только journey своих подразделений.
      if (scope === 'department') {
        const jd = deptByJourney.get(journeyId) ?? null
        if (!jd || !myDepts.includes(jd)) continue
      }
      const d = daysSince(s.activated_at, nowMs)
      let entry = byJourney.get(journeyId)
      if (!entry) {
        const person = personByJourney.get(journeyId)
        entry = {
          journey_id: journeyId,
          applicant: {
            full_name: person?.full_name ?? '',
            hebrew_name: person?.hebrew_name ?? null,
            photo_url: person?.photo_url ?? null,
          },
          stages: [],
          max_days: 0,
        }
        byJourney.set(journeyId, entry)
      }
      entry.stages.push({
        stage_code: s.stage_template?.code ?? '',
        stage_name: s.stage_template?.name_ru ?? '',
        days: d,
        role_code: s.stage_template?.required_role_code ?? null,
      })
      if (d > entry.max_days) entry.max_days = d
    }

    const applicants = [...byJourney.values()].sort((a, b) => b.max_days - a.max_days)

    return NextResponse.json({ applicants, days })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
