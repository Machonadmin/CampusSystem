import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getClassGroupTarget } from '@/lib/education/lesson-access'

/**
 * GET /api/education/class-groups/[id]/enrollments
 * Список journeys (студентов), записанных в учебную группу.
 * Право: view_students в контексте группы (как сиблинги lessons/assessments).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const target = await getClassGroupTarget(sb, params.id)
    if (!target) return apiError('group_not_found', 404)

    await requireEducationPrivilege('view_students', target)

    const { data, error } = await sb
      .from('class_enrollments')
      .select(`
        journey_id,
        class_group_id,
        enrolled_at,
        journey:education_journeys(
          id,
          education_status,
          primary_department_id,
          specialty_id,
          main_group_id,
          year_level,
          person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name),
          main_group:study_groups(id, name)
        )
      `)
      .eq('class_group_id', params.id)
      .order('enrolled_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ enrollments: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * POST /api/education/class-groups/[id]/enrollments
 * Записать одного или нескольких студентов (journey) в учебную группу.
 *
 * Body: { journey_ids: string[] }
 *   ИЛИ { student_ids: string[] } (backward-compat алиас: student_ids == journey_ids)
 *
 * Только journeys с education_status='student' могут быть записаны.
 * Идемпотентен: уже записанные пропускаются.
 * Возвращает: { added, already, total }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      journey_ids?: string[]
      student_ids?: string[]  // backward-compat алиас
    }

    const rawIds = body.journey_ids ?? body.student_ids
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return apiError('journey_ids_required_array', 400)
    }
    const uniqueIds = Array.from(new Set(rawIds))

    const sb = createServerClient()

    const { data: group, error: gErr } = await sb
      .from('class_groups')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (gErr) throw gErr
    if (!group) return apiError('study_group_not_found', 404)

    await requireEducationPrivilege('manage_enrollments', { department_id: group.department_id })

    // Проверить, что все journeys существуют и имеют status='student'
    const { data: journeys, error: jErr } = await sb
      .from('education_journeys')
      .select('id, education_status')
      .in('id', uniqueIds)
    if (jErr) throw jErr

    const foundIds = new Set((journeys ?? []).map(j => j.id))
    const missing = uniqueIds.filter(id => !foundIds.has(id))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Journey не найдены: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    const nonStudents = (journeys ?? []).filter(j => j.education_status !== 'student')
    if (nonStudents.length > 0) {
      return apiError('enroll_only_students', 400)
    }

    // Уже записанные
    const { data: existingEnrolls, error: eeErr } = await sb
      .from('class_enrollments')
      .select('journey_id')
      .eq('class_group_id', params.id)
      .in('journey_id', uniqueIds)
    if (eeErr) throw eeErr

    const alreadyIds = new Set((existingEnrolls ?? []).map(e => e.journey_id))
    const toAdd = uniqueIds.filter(id => !alreadyIds.has(id))

    if (toAdd.length > 0) {
      const rows = toAdd.map(journey_id => ({ journey_id, class_group_id: params.id }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await sb.from('class_enrollments').insert(rows as any)
      if (insErr) {
        if (insErr.code === '23503') {
          return apiError('invalid_reference', 400)
        }
        throw insErr
      }
    }

    return NextResponse.json({
      added: toAdd.length,
      already: alreadyIds.size,
      total: uniqueIds.length,
    }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
