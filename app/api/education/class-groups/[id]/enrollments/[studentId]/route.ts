import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'

/**
 * DELETE /api/education/class-groups/[id]/enrollments/[studentId]
 * Снять запись из учебной группы.
 *
 * Параметр [studentId] сохранён для совместимости UI; теперь это journey_id.
 * Право: manage_enrollments в подразделении группы.
 * Идемпотентен: если записи нет — { ok: true, already: true }.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; studentId: string } }
) {
  try {
    const sb = createServerClient()

    const { data: group, error: gErr } = await sb
      .from('class_groups')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (gErr) throw gErr
    if (!group) return NextResponse.json({ error: 'Учебная группа не найдена' }, { status: 404 })

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

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
