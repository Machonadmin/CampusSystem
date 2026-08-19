import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'

/**
 * DELETE /api/education/class-groups/[id]/teachers/[personId]
 * Право: manage_class_teachers в подразделении группы.
 * Если снимаем primary и остались другие — первый по алфавиту становится новым primary.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; personId: string } }
) {
  try {
    const sb = createServerClient()

    const { data: group, error: groupErr } = await sb
      .from('class_groups')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (groupErr) throw groupErr
    if (!group) return apiError('group_not_found', 404)

    await requireEducationPrivilege('manage_class_teachers', { department_id: group.department_id })

    const { data: target, error: targetErr } = await sb
      .from('class_teachers')
      .select('is_primary')
      .eq('class_group_id', params.id)
      .eq('teacher_id', params.personId)
      .maybeSingle()
    if (targetErr) throw targetErr
    if (!target) return apiError('teacher_not_linked_group', 404)

    const { error: delErr } = await sb
      .from('class_teachers')
      .delete()
      .eq('class_group_id', params.id)
      .eq('teacher_id', params.personId)
    if (delErr) throw delErr

    // Если сняли primary — автоматически назначаем следующего
    if (target.is_primary) {
      const { data: remaining } = await sb
        .from('class_teachers')
        .select('teacher_id')
        .eq('class_group_id', params.id)
        .order('teacher_id')
        .limit(1)
      if (remaining && remaining.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await sb
          .from('class_teachers')
          .update({ is_primary: true } as any)
          .eq('class_group_id', params.id)
          .eq('teacher_id', remaining[0].teacher_id)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * PATCH /api/education/class-groups/[id]/teachers/[personId]
 * Body: { is_primary: boolean }
 * Право: manage_class_teachers в подразделении группы.
 * При is_primary=true — снимаем флаг у всех остальных, ставим этому.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; personId: string } }
) {
  try {
    const body = await request.json() as { is_primary?: boolean }
    if (body.is_primary === undefined) {
      return apiError('is_primary_required', 400)
    }

    const sb = createServerClient()

    const { data: group, error: groupErr } = await sb
      .from('class_groups')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (groupErr) throw groupErr
    if (!group) return apiError('group_not_found', 404)

    await requireEducationPrivilege('manage_class_teachers', { department_id: group.department_id })

    const { data: target, error: targetErr } = await sb
      .from('class_teachers')
      .select('teacher_id')
      .eq('class_group_id', params.id)
      .eq('teacher_id', params.personId)
      .maybeSingle()
    if (targetErr) throw targetErr
    if (!target) return apiError('teacher_not_linked_group', 404)

    if (body.is_primary) {
      // Снимаем primary у всех — уникальный частичный индекс позволяет только одного primary
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sb
        .from('class_teachers')
        .update({ is_primary: false } as any)
        .eq('class_group_id', params.id)
        .neq('teacher_id', params.personId)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await sb
      .from('class_teachers')
      .update({ is_primary: body.is_primary } as any)
      .eq('class_group_id', params.id)
      .eq('teacher_id', params.personId)
    if (updateErr) throw updateErr

    return NextResponse.json({ ok: true, is_primary: body.is_primary })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
