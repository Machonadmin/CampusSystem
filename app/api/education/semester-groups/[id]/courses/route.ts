import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege, hasEducationPrivilege } from '@/lib/education/permissions'

/**
 * Курсы внутри семестра. Курс = class_groups, у которого parent_semester_id
 * указывает на семестр (class_groups с is_semester=true).
 *
 *   GET  — список курсов семестра (+ число преподавателей и студенток).
 *   POST — создать курс: { name, subject_id?, teacher_ids?, student_journey_ids? }.
 *          Студентки курса — ПОДМНОЖЕСТВО ростера семестра (кто не в семестре —
 *          пропускается).
 *
 * Всё деплой-безопасно: если колонки parent_semester_id ещё нет (миграция
 * studies_drilldown не применена) — GET отдаёт пустой список, POST — 503.
 */

function u(sb: ReturnType<typeof createServerClient>): SupabaseClient {
  return sb as unknown as SupabaseClient
}

async function semesterDept(sb: ReturnType<typeof createServerClient>, semesterId: string): Promise<string | null> {
  const { data } = await sb.from('class_groups').select('department_id').eq('id', semesterId).maybeSingle()
  return (data as { department_id: string | null } | null)?.department_id ?? null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const sb = createServerClient()
    const dept = await semesterDept(sb, params.id)
    const allowed = session.roles.includes('superadmin')
      || await hasEducationPrivilege(session, 'view_students', dept ? { department_id: dept } : undefined)
    if (!allowed) return apiError('forbidden', 403)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (u(sb)
      .from('class_groups')
      .select('id, name, subject_id, is_active, subject:subjects(id, name, name_he)')
      .eq('parent_semester_id', params.id)
      .order('name') as any)
    if (error) {
      if (error.code === '42703' || error.code === '42P01') return NextResponse.json({ courses: [] })
      throw error
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[]
    if (rows.length === 0) return NextResponse.json({ courses: [] })
    const ids = rows.map(r => r.id as string)

    const [teachersRes, enrollsRes] = await Promise.all([
      sb.from('class_teachers').select('class_group_id').in('class_group_id', ids),
      sb.from('class_enrollments').select('class_group_id').in('class_group_id', ids),
    ])
    const tCount = new Map<string, number>()
    for (const r of teachersRes.data ?? []) tCount.set(r.class_group_id, (tCount.get(r.class_group_id) ?? 0) + 1)
    const sCount = new Map<string, number>()
    for (const r of enrollsRes.data ?? []) sCount.set(r.class_group_id, (sCount.get(r.class_group_id) ?? 0) + 1)

    const courses = rows.map(r => ({
      id: r.id,
      name: r.name,
      subject: r.subject ?? null,
      is_active: r.is_active ?? true,
      counts: { teachers: tCount.get(r.id) ?? 0, students: sCount.get(r.id) ?? 0 },
    }))
    return NextResponse.json({ courses })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42703' || e.code === '42P01') return NextResponse.json({ courses: [] })
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json() as {
      name?: string
      subject_id?: string | null
      teacher_ids?: string[]
      student_journey_ids?: string[]
    }
    const name = body.name?.trim()
    if (!name) return apiError('title_required', 400)

    const sb = createServerClient()
    const dept = await semesterDept(sb, params.id)
    if (!dept) return apiError('not_found', 404)

    const session = await requireEducationPrivilege('manage_class_groups', { department_id: dept })

    // Вставка курса (class_groups с parent_semester_id). Деплой-безопасно: без
    // колонки → 503 «примените миграцию».
    const insert: Record<string, unknown> = {
      name,
      department_id: dept,
      subject_id: body.subject_id || null,
      is_semester: false,
      parent_semester_id: params.id,
      is_active: true,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ins = await (u(sb).from('class_groups').insert(insert as any).select('id').single() as any)
    if (ins.error) {
      if (ins.error.code === '42703') return apiError('feature_not_migrated', 503)
      if (ins.error.code === '23505') return apiError('study_group_name_exists', 409)
      if (ins.error.code === '23503') return apiError('invalid_reference', 400)
      throw ins.error
    }
    const courseId = ins.data.id as string

    // Преподаватели.
    const teacherIds = Array.from(new Set((body.teacher_ids ?? []).filter(Boolean)))
    if (teacherIds.length > 0) {
      const rows = teacherIds.map((teacher_id, idx) => ({
        class_group_id: courseId, teacher_id, is_primary: idx === 0, added_by: session.person_id,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await u(sb).from('class_teachers').insert(rows as any)
    }

    // Студентки курса — только те, кто уже в ростере СЕМЕСТРА.
    let warning: string | undefined
    const wanted = Array.from(new Set((body.student_journey_ids ?? []).filter(Boolean)))
    if (wanted.length > 0) {
      const { data: sem } = await sb.from('class_enrollments').select('journey_id').eq('class_group_id', params.id)
      const inSemester = new Set((sem ?? []).map(r => (r as { journey_id: string }).journey_id))
      const eligible = wanted.filter(j => inSemester.has(j))
      const skipped = wanted.length - eligible.length
      if (eligible.length > 0) {
        const rows = eligible.map(journey_id => ({ journey_id, class_group_id: courseId }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: enErr } = await sb.from('class_enrollments').insert(rows as any)
        if (enErr && enErr.code !== '23503') throw enErr
      }
      if (skipped > 0) warning = `${skipped} students are not in the semester roster and were skipped.`
    }

    return NextResponse.json({ id: courseId, ...(warning ? { warning } : {}) }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '23505') return apiError('study_group_name_exists', 409)
    if (e.code === '23503') return apiError('invalid_reference', 400)
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
