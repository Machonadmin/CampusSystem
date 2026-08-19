import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'

/**
 * GET /api/education/track-assignment
 *
 * Рабочий список «шибуц ле-маслуль»: студентки (education_status='student'),
 * которым ещё НЕ назначен маршрут второй половины дня (нет строки в
 * journey_study_tracks или track_id пуст). Так руководитель сразу после
 * «אישור לימודים» видит, кому назначить маршрут חול, и делает это на месте
 * (PUT /api/education/journeys/[id]/track).
 *
 * Право: view_students; scope='department' — только свои подразделения,
 * scope='all'/superadmin — все. Деплой-безопасно к отсутствию journey_study_tracks.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const isSuper = session.roles.includes('superadmin')
    const scope = isSuper ? 'all' : await getEducationPrivilegeScope(session, 'view_students')
    if (!scope) return apiError('forbidden', 403)

    const sb = createServerClient()

    let myDepts: string[] | null = null
    if (scope === 'department') {
      myDepts = await getUserDepartmentIds(session.person_id)
      if (myDepts.length === 0) return NextResponse.json({ students: [] })
    }

    let q = sb.from('education_journeys')
      .select('id, primary_department_id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name), department:departments!education_journeys_primary_department_id_fkey(id, name)')
      .eq('education_status', 'student')
    if (myDepts) q = q.in('primary_department_id', myDepts)
    const { data: journeysRaw, error } = await q
    if (error) throw error
    const journeys = (journeysRaw ?? []) as unknown as Array<{
      id: string
      person: { full_name: string | null; hebrew_name: string | null } | null
      department: { id: string; name: string } | null
    }>
    if (journeys.length === 0) return NextResponse.json({ students: [] })

    // Кто уже с маршрутом (track_id не пуст). Деплой-безопасно: нет таблицы → никто.
    const assigned = new Set<string>()
    try {
      const journeyIds = journeys.map(j => j.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: jt, error: jtErr } = await (sb as any)
        .from('journey_study_tracks')
        .select('journey_id, track_id')
        .in('journey_id', journeyIds)
      if (jtErr) throw jtErr
      for (const r of (jt ?? []) as Array<{ journey_id: string; track_id: string | null }>) {
        if (r.track_id) assigned.add(r.journey_id)
      }
    } catch (e) {
      if ((e as { code?: string }).code !== '42P01') throw e
    }

    const students = journeys
      .filter(j => !assigned.has(j.id))
      .map(j => ({
        journey_id: j.id,
        name: j.person?.hebrew_name || j.person?.full_name || '',
        department: j.department ? { id: j.department.id, name: j.department.name } : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'))

    return NextResponse.json({ students })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42P01') return NextResponse.json({ students: [] })
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
