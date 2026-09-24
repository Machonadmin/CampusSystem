import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { ACTIVE_STUDENT_STATUSES } from '@/lib/education/journey-status'

/**
 * PATCH /api/education/kodesh/levels/[id]
 * Body: { is_active: boolean } — скрыть (false) или вернуть (true) уровень кодеша.
 *
 * Уровень НЕ удаляется (решение владельца 2026-09-23, spec §1.3): настоящее
 * удаление каскадом стёрло бы курсы уровня с уроками и оценками. Скрытие
 * запрещено (409), пока в уровне есть действующие студентки или активные курсы —
 * их сначала переводят/закрывают.
 *
 * Право: manage_class_groups на кафедре иудаики (как переименование).
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const body = await request.json() as { is_active?: boolean }
    if (typeof body.is_active !== 'boolean') return apiError('no_changes', 400)

    await requireEducationPrivilege('manage_class_groups', { department_id: KODESH_DEPT_ID })

    const sb = createServerClient()

    // Только уровень кодеша (не курс внутри уровня и не группа другой кафедры).
    const { data: level, error: fetchErr } = await sb
      .from('class_groups')
      .select('id')
      .eq('id', params.id)
      .eq('department_id', KODESH_DEPT_ID)
      .is('parent_semester_id', null)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!level) return apiError('group_not_found', 404)

    if (body.is_active === false) {
      // Действующие студентки, приписанные к уровню.
      const { data: enr, error: enrErr } = await sb
        .from('class_enrollments')
        .select('journey_id')
        .eq('class_group_id', params.id)
      if (enrErr) throw enrErr
      const journeyIds = (enr ?? []).map(r => r.journey_id)
      if (journeyIds.length > 0) {
        const { count, error: cntErr } = await sb
          .from('education_journeys')
          .select('id', { count: 'exact', head: true })
          .in('id', journeyIds)
          .in('education_status', ACTIVE_STUDENT_STATUSES)
        if (cntErr) throw cntErr
        if (count && count > 0) {
          return apiErrorWith('kodesh_level_hide_has_students', 409, { count })
        }
      }

      // Активные курсы внутри уровня.
      const { count: coursesCount, error: cErr } = await sb
        .from('class_groups')
        .select('id', { count: 'exact', head: true })
        .eq('parent_semester_id', params.id)
        .eq('is_active', true)
      if (cErr) throw cErr
      if (coursesCount && coursesCount > 0) {
        return apiErrorWith('kodesh_level_hide_has_courses', 409, { count: coursesCount })
      }
    }

    const { error } = await sb
      .from('class_groups')
      .update({ is_active: body.is_active })
      .eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true, is_active: body.is_active })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
