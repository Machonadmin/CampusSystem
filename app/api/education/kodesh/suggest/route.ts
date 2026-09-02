import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { suggestKodeshPlacement, type SuggestMode } from '@/lib/education/assignment-suggestions'
import { JEWISHNESS_FINAL_APPROVED } from '@/lib/jewishness/two-step'

/**
 * GET /api/education/kodesh/suggest?mode=continue_semester|advance_year
 *
 * Движок предложений (spec §3.5): по каждой студентке-кодеша считает предлагаемый
 * уровень/поток на основе её ТЕКУЩЕГО назначения. НИЧЕГО не пишет — Chana
 * подтверждает вручную (PUT /api/education/kodesh/assignment). Возвращает по
 * студентке: текущая группа, предлагаемая группа (если существует), причина.
 *
 * Deploy-safe: нет колонок kodesh_level/kodesh_stream (42703) → предложений нет.
 */

async function canManageKodesh(session: Parameters<typeof canManageUnit>[0]): Promise<boolean> {
  if (await canManageUnit(session, KODESH_DEPT_ID)) return true
  const target = { department_id: KODESH_DEPT_ID }
  return (await hasEducationPrivilege(session, 'manage_enrollments', target))
    || (await hasEducationPrivilege(session, 'manage_class_groups', target))
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageKodesh(session))) return apiError('forbidden', 403)

    const modeParam = new URL(request.url).searchParams.get('mode')
    const mode: SuggestMode = modeParam === 'advance_year' ? 'advance_year' : 'continue_semester'

    const sb = createServerClient()

    // Уровни кодеша с level/stream. Deploy-safe: без колонок → пусто.
    type KGroup = { id: string; name: string; name_he: string | null; name_en: string | null; kodesh_level: number | null; kodesh_stream: string | null }
    let groups: KGroup[] = []
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb.from('class_groups') as any)
        .select('id, name, name_he, name_en, kodesh_level, kodesh_stream')
        .eq('department_id', KODESH_DEPT_ID)
        .eq('is_active', true)
        .is('parent_semester_id', null)
      if (error) {
        if (error.code === '42703' || error.code === '42P01') return NextResponse.json({ mode, suggestions: [] })
        throw error
      }
      groups = (data ?? []) as KGroup[]
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ mode, suggestions: [] })
      throw e
    }
    const groupById = new Map(groups.map(g => [g.id, g]))
    // (level, stream) → group id. stream null нормализуем в ''.
    const groupByLevelStream = new Map<string, KGroup>()
    for (const g of groups) {
      if (g.kodesh_level != null) groupByLevelStream.set(`${g.kodesh_level}#${g.kodesh_stream ?? ''}`, g)
    }
    const kodeshGroupIds = new Set(groups.map(g => g.id))

    // Ворота (spec §3.3): только финально одобренные по еврейству студентки.
    const { data: journeysRaw, error: jErr } = await sb
      .from('education_journeys')
      .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
      .eq('education_status', 'student')
      .eq('jewishness_status', JEWISHNESS_FINAL_APPROVED)
    if (jErr) throw jErr
    const journeys = (journeysRaw ?? []) as unknown as Array<{ id: string; person: { full_name: string | null; hebrew_name: string | null } | null }>
    if (journeys.length === 0) return NextResponse.json({ mode, suggestions: [] })

    // Текущее кодеш-назначение journey → group.
    const currentByJourney = new Map<string, string>()
    if (kodeshGroupIds.size > 0) {
      const { data: enr } = await sb
        .from('class_enrollments')
        .select('journey_id, class_group_id')
        .in('journey_id', journeys.map(j => j.id))
        .in('class_group_id', [...kodeshGroupIds])
      for (const r of (enr ?? []) as Array<{ journey_id: string; class_group_id: string }>) {
        currentByJourney.set(r.journey_id, r.class_group_id)
      }
    }

    const gname = (g: KGroup | undefined) => g ? (g.name_he || g.name) : null

    const suggestions = journeys.map(j => {
      const curGroupId = currentByJourney.get(j.id) ?? null
      const curGroup = curGroupId ? groupById.get(curGroupId) : undefined
      const s = suggestKodeshPlacement(
        { journeyId: j.id, currentLevel: curGroup?.kodesh_level ?? null, currentStream: curGroup?.kodesh_stream ?? null },
        mode,
      )
      const target = s.suggestedLevel != null ? groupByLevelStream.get(`${s.suggestedLevel}#${s.suggestedStream ?? ''}`) : undefined
      return {
        journey_id: j.id,
        name: j.person?.hebrew_name || j.person?.full_name || '',
        current_group_id: curGroupId,
        current_group_name: gname(curGroup),
        suggested_group_id: target?.id ?? null,
        suggested_group_name: gname(target),
        reason: s.reason,
      }
    }).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    return NextResponse.json({ mode, suggestions })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42P01') return NextResponse.json({ mode: 'continue_semester', suggestions: [] })
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
