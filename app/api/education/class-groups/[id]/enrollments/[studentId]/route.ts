import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { errorResponse } from '@/lib/api/handler'
import { isMissingColumn } from '@/lib/supabase/errors'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { syncKodeshCourseEnrollments } from '@/lib/education/kodesh-placement'

/**
 * DELETE /api/education/class-groups/[id]/enrollments/[studentId]
 * Снять запись из учебной группы.
 *
 * Параметр [studentId] сохранён для совместимости UI; теперь это journey_id.
 * Право: manage_enrollments в подразделении группы.
 * Идемпотентен: если записи нет — { ok: true, already: true }.
 * Уровень кодеша: студентка снимается и с курсов этого уровня.
 */
export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string; studentId: string }> }
) {
  const params = await props.params
  try {
    const sb = createServerClient()

    const { data: group, error: gErr } = await sb
      .from('class_groups')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (gErr) throw gErr
    if (!group) return apiError('study_group_not_found', 404)

    await requireEducationPrivilege('manage_enrollments', { department_id: group.department_id })

    const { data: existing, error: chkErr } = await sb
      .from('class_enrollments')
      .select('journey_id')
      .eq('class_group_id', params.id)
      .eq('journey_id', params.studentId)
      .maybeSingle()
    if (chkErr) throw chkErr

    if (!existing) return NextResponse.json({ ok: true, already: true })

    const { error: delErr } = await sb
      .from('class_enrollments')
      .delete()
      .eq('class_group_id', params.id)
      .eq('journey_id', params.studentId)
    if (delErr) throw delErr

    // Снятие с УРОВНЯ кодеша = снятие и с курсов этого уровня (как в шибуце).
    if (group.department_id === KODESH_DEPT_ID) {
      const { data: lv, error: lvErr } = await sb
        .from('class_groups')
        .select('id')
        .eq('id', params.id)
        .is('parent_semester_id', null)
        .maybeSingle()
      if (lvErr && !isMissingColumn(lvErr)) throw lvErr
      if (lv) await syncKodeshCourseEnrollments(sb, params.studentId, null, [params.id])
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
