import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { courseIssues } from '@/lib/education/course-checks'
import { JEWISHNESS_FINAL_APPROVED } from '@/lib/jewishness/two-step'

/**
 * GET /api/education/kodesh/home — агрегат для двух домашних экранов (spec §4.2):
 *   prep     — статистика подготовки семестра (шибуц, группы, курсы, ждущие
 *              утверждения преподаватели, курсы с пробелами).
 *   students — список студенток (фото, имя, основной маршрут+год, группа кодеша,
 *              счётчик открытых оповещений).
 * Deploy-safe к отсутствию новых таблиц/колонок.
 */

async function canManageKodesh(session: Parameters<typeof canManageUnit>[0]): Promise<boolean> {
  if (await canManageUnit(session, KODESH_DEPT_ID)) return true
  const target = { department_id: KODESH_DEPT_ID }
  return (await hasEducationPrivilege(session, 'manage_enrollments', target))
    || (await hasEducationPrivilege(session, 'manage_class_groups', target))
}

export async function GET(_request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageKodesh(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const seeSensitive = await hasEducationPrivilege(session, 'view_sensitive_alerts')

    // Kodesh groups (levels + courses).
    type KG = { id: string; name: string; name_he: string | null; parent_semester_id: string | null; hours: number | null; is_active: boolean }
    let kgroups: KG[] = []
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb.from('class_groups') as any)
        .select('id, name, name_he, parent_semester_id, hours, is_active')
        .eq('department_id', KODESH_DEPT_ID).eq('is_active', true)
      if (error) { if (error.code !== '42703' && error.code !== '42P01') throw error }
      else kgroups = (data ?? []) as KG[]
    } catch (e) { if ((e as { code?: string }).code !== '42P01') throw e }

    const levels = kgroups.filter(g => !g.parent_semester_id)
    const courses = kgroups.filter(g => g.parent_semester_id)
    const levelById = new Map(levels.map(g => [g.id, g]))
    const levelIds = new Set(levels.map(g => g.id))

    // Teacher counts per course.
    const teacherCountByCourse = new Map<string, number>()
    if (courses.length > 0) {
      const { data: ct } = await sb.from('class_teachers').select('class_group_id').in('class_group_id', courses.map(c => c.id))
      for (const r of (ct ?? []) as Array<{ class_group_id: string }>) teacherCountByCourse.set(r.class_group_id, (teacherCountByCourse.get(r.class_group_id) ?? 0) + 1)
    }
    const coursesWithIssues = courses.filter(c => courseIssues({
      teacherCount: teacherCountByCourse.get(c.id) ?? 0,
      hours: c.hours,
      slotCount: 1, roomCount: 1, // slot/room checks live in the timetable view; here only teacher/hours
    }).length > 0).length

    // Pending teacher approvals.
    let pendingApprovals = 0
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb.from('teacher_course_approvals') as any).select('id').eq('status', 'proposed')
      if (error) { if (error.code !== '42P01') throw error }
      else pendingApprovals = (data ?? []).length
    } catch (e) { if ((e as { code?: string }).code !== '42P01') throw e }

    // Students — ворота (spec §3.3): только финально одобренные по еврейству.
    const { data: journeysRaw, error: jErr } = await sb
      .from('education_journeys')
      .select('id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, photo_url)')
      .eq('education_status', 'student')
      .eq('jewishness_status', JEWISHNESS_FINAL_APPROVED)
    if (jErr) throw jErr
    const journeys = (journeysRaw ?? []) as unknown as Array<{ id: string; person: { id: string; full_name: string | null; hebrew_name: string | null; photo_url: string | null } | null }>

    const journeyIds = journeys.map(j => j.id)
    // Kodesh group per journey.
    const kodeshByJourney = new Map<string, string>()
    if (journeyIds.length > 0 && levelIds.size > 0) {
      const { data: enr } = await sb.from('class_enrollments').select('journey_id, class_group_id').in('journey_id', journeyIds).in('class_group_id', [...levelIds])
      for (const r of (enr ?? []) as Array<{ journey_id: string; class_group_id: string }>) kodeshByJourney.set(r.journey_id, r.class_group_id)
    }
    // Primary track per journey.
    const primaryByJourney = new Map<string, { track_id: string; year_level: number }>()
    if (journeyIds.length > 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (sb.from('journey_study_tracks') as any).select('journey_id, track_id, role, year_level').in('journey_id', journeyIds)
        if (error) { if (error.code !== '42703' && error.code !== '42P01') throw error }
        else for (const r of (data ?? []) as Array<{ journey_id: string; track_id: string; role?: string; year_level?: number }>) {
          if ((r.role ?? 'primary') === 'primary') primaryByJourney.set(r.journey_id, { track_id: r.track_id, year_level: r.year_level ?? 1 })
        }
      } catch (e) { if ((e as { code?: string }).code !== '42P01') throw e }
    }
    // Track names.
    const trackIds = [...new Set([...primaryByJourney.values()].map(v => v.track_id))]
    const trackName = new Map<string, string>()
    if (trackIds.length > 0) {
      const { data } = await sb.from('study_tracks').select('id, name_he, name_ru').in('id', trackIds)
      for (const r of (data ?? []) as Array<{ id: string; name_he: string | null; name_ru: string | null }>) trackName.set(r.id, r.name_he || r.name_ru || '')
    }
    // Open alerts per person.
    const personIds = journeys.map(j => j.person?.id).filter(Boolean) as string[]
    const alertsByPerson = new Map<string, number>()
    if (personIds.length > 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (sb.from('student_alerts') as any).select('student_id, is_sensitive').neq('state', 'closed').in('student_id', personIds)
        if (!seeSensitive) q = q.eq('is_sensitive', false)
        const { data, error } = await q
        if (error) { if (error.code !== '42P01') throw error }
        else for (const r of (data ?? []) as Array<{ student_id: string }>) alertsByPerson.set(r.student_id, (alertsByPerson.get(r.student_id) ?? 0) + 1)
      } catch (e) { if ((e as { code?: string }).code !== '42P01') throw e }
    }

    const students = journeys.map(j => {
      const p = j.person
      const groupId = kodeshByJourney.get(j.id) ?? null
      const level = groupId ? levelById.get(groupId) : undefined
      const primary = primaryByJourney.get(j.id)
      return {
        journey_id: j.id,
        name: p?.hebrew_name || p?.full_name || '',
        photo_url: p?.photo_url ?? null,
        kodesh_group_name: level ? (level.name_he || level.name) : null,
        primary_track_name: primary ? (trackName.get(primary.track_id) ?? null) : null,
        year_level: primary?.year_level ?? null,
        alerts_open: p?.id ? (alertsByPerson.get(p.id) ?? 0) : 0,
      }
    }).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    const assigned = students.filter(s => s.kodesh_group_name).length
    return NextResponse.json({
      prep: {
        students_total: students.length,
        assigned,
        unassigned: students.length - assigned,
        levels: levels.length,
        courses: courses.length,
        courses_with_issues: coursesWithIssues,
        pending_teacher_approvals: pendingApprovals,
      },
      students,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42P01') return NextResponse.json({ prep: null, students: [] })
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
