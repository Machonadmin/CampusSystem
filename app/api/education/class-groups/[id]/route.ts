import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege, hasEducationPrivilege } from '@/lib/education/permissions'
import type { ClassGroupUpdate } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

const CLASS_GROUP_SELECT = `
  *,
  subject:subjects(id, name, name_he),
  department:departments(id, name)
`

/**
 * GET /api/education/class-groups/[id]
 * Возвращает детальную карточку: поля группы + teachers[] + students[].
 *
 * Право: view_students в подразделении группы. Карточка отдаёт состав
 * (ФИО студенток) — как в enrollments/assessments/lessons той же группы, —
 * поэтому одной авторизации мало.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const { data: group, error } = await sb
      .from('class_groups')
      .select(CLASS_GROUP_SELECT)
      .eq('id', params.id)
      .maybeSingle()
    if (error) throw error
    if (!group) return apiError('group_not_found', 404)

    const groupDept = (group as { department_id?: string | null }).department_id ?? null
    const canView = await hasEducationPrivilege(
      session, 'view_students', groupDept ? { department_id: groupDept } : undefined,
    )
    if (!canView) return apiError('forbidden', 403)

    const [teachersRes, enrollsRes] = await Promise.all([
      sb.from('class_teachers')
        .select('teacher_id, is_primary, person:persons!class_teachers_teacher_id_fkey(id, full_name)')
        .eq('class_group_id', params.id),
      sb.from('class_enrollments')
        .select('journey_id')
        .eq('class_group_id', params.id),
    ])
    if (teachersRes.error) throw teachersRes.error
    if (enrollsRes.error) throw enrollsRes.error

    const teachers = (teachersRes.data ?? [])
      .map(row => {
        const person = (row.person as unknown) as { id: string; full_name: string | null } | null
        return person
          ? { person_id: person.id, full_name: person.full_name, is_primary: row.is_primary ?? false }
          : null
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))

    const journeyIds = (enrollsRes.data ?? []).map(r => r.journey_id)
    let students: { journey_id: string; person_id: string; full_name: string | null; hebrew_name: string | null }[] = []

    if (journeyIds.length > 0) {
      const { data: jRows, error: jErr } = await sb
        .from('education_journeys')
        .select('id, person_id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)')
        .in('id', journeyIds)
      if (jErr) throw jErr
      students = (jRows ?? []).map(j => {
        const p = (j.person as unknown) as { id: string; full_name: string | null; hebrew_name: string | null } | null
        return {
          journey_id: j.id,
          person_id: j.person_id,
          full_name: p?.full_name ?? null,
          hebrew_name: p?.hebrew_name ?? null,
        }
      })
    }

    return NextResponse.json({
      ...group,
      counts: { students: journeyIds.length },
      teachers,
      students,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * PATCH /api/education/class-groups/[id]
 * Право: manage_class_groups в подразделении группы.
 * При смене department_id — проверка в обоих.
 * При смене subject_id — проверка принадлежности к (новому) department.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      name?: string
      subject_id?: string
      department_id?: string
      level?: string | null
      period_start?: string | null
      period_end?: string | null
      notes?: string | null
      is_active?: boolean
    }

    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('class_groups')
      .select('department_id, subject_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return apiError('group_not_found', 404)

    await requireEducationPrivilege('manage_class_groups', { department_id: current.department_id })

    const newDepartmentId = body.department_id ?? current.department_id
    if (body.department_id && body.department_id !== current.department_id) {
      await requireEducationPrivilege('manage_class_groups', { department_id: body.department_id })
    }

    const newSubjectId = body.subject_id ?? current.subject_id
    if (body.subject_id && body.subject_id !== current.subject_id) {
      const { data: subject } = await sb
        .from('subjects')
        .select('department_id')
        .eq('id', newSubjectId)
        .maybeSingle()
      if (!subject) return apiError('subject_not_found', 400)
      if (subject.department_id !== newDepartmentId) {
        return apiError('subject_other_department', 400)
      }
    }

    const update: ClassGroupUpdate = {}
    if (body.name !== undefined) {
      const n = body.name?.trim()
      if (!n) return apiError('title_not_empty', 400)
      update.name = n
    }
    if (body.subject_id !== undefined) update.subject_id = body.subject_id
    if (body.department_id !== undefined) update.department_id = body.department_id
    if (body.level !== undefined) update.level = body.level?.trim() || null
    if (body.period_start !== undefined) update.period_start = body.period_start
    if (body.period_end !== undefined) update.period_end = body.period_end
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null
    if (body.is_active !== undefined) update.is_active = body.is_active

    if (Object.keys(update).length === 0) {
      return apiError('no_changes', 400)
    }

    const { data, error } = await sb
      .from('class_groups')
      .update(update)
      .eq('id', params.id)
      .select(CLASS_GROUP_SELECT)
      .single()

    if (error) {
      if (error.code === '23505') return apiError('group_name_exists', 409)
      if (error.code === '23503') return apiError('invalid_reference_generic', 400)
      if (error.code === '23514') {
        if (error.message?.includes('period_consistency')) return apiError('period_end_after_start', 400)
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * DELETE /api/education/class-groups/[id]
 * Право: manage_class_groups в подразделении группы.
 * Отказывает (409) если есть enrollments — нужно сначала снять студентов.
 * class_teachers удаляются каскадно (ON DELETE CASCADE).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('class_groups')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return apiError('group_not_found', 404)

    await requireEducationPrivilege('manage_class_groups', { department_id: current.department_id })

    const { count: enrollCount, error: cntErr } = await sb
      .from('class_enrollments')
      .select('journey_id', { count: 'exact', head: true })
      .eq('class_group_id', params.id)
    if (cntErr) throw cntErr

    if (enrollCount && enrollCount > 0) {
      return NextResponse.json(
        { error: `Нельзя удалить группу — в ней ${enrollCount} записанных студентов. Сначала снимите студентов с группы.` },
        { status: 409 }
      )
    }

    const { error } = await sb.from('class_groups').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
