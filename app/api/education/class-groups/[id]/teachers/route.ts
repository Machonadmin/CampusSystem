import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'

/**
 * POST /api/education/class-groups/[id]/teachers
 * Право: manage_class_teachers в подразделении группы.
 *
 * Body: { teacher_ids: string[], make_first_primary?: boolean }
 * - Upsert: если преподаватель уже привязан — пропускаем
 * - make_first_primary=true И в группе нет ни одного primary → первый из новых станет primary
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      teacher_ids?: string[]
      make_first_primary?: boolean
    }

    const teacherIds = body.teacher_ids ?? []
    if (teacherIds.length === 0) {
      return NextResponse.json({ error: 'teacher_ids не может быть пустым' }, { status: 400 })
    }

    const sb = createServerClient()

    const { data: group, error: groupErr } = await sb
      .from('class_groups')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (groupErr) throw groupErr
    if (!group) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 })

    const session = await requireEducationPrivilege('manage_class_teachers', { department_id: group.department_id })

    const uniqueIds = Array.from(new Set(teacherIds))

    // Проверяем, есть ли уже primary в группе
    const { data: existing, error: existErr } = await sb
      .from('class_teachers')
      .select('teacher_id, is_primary')
      .eq('class_group_id', params.id)
    if (existErr) throw existErr

    const existingIds = new Set((existing ?? []).map(r => r.teacher_id))
    const hasPrimary = (existing ?? []).some(r => r.is_primary)

    const newIds = uniqueIds.filter(id => !existingIds.has(id))
    if (newIds.length === 0) {
      return NextResponse.json({ added: 0, message: 'Все преподаватели уже привязаны' })
    }

    const shouldSetPrimary = (body.make_first_primary ?? false) && !hasPrimary
    const rows = newIds.map((teacher_id, idx) => ({
      class_group_id: params.id,
      teacher_id,
      is_primary: shouldSetPrimary && idx === 0,
      added_by: session.person_id,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertErr } = await sb.from('class_teachers').insert(rows as any)
    if (insertErr) {
      if (insertErr.code === '23503') {
        return NextResponse.json({ error: 'Один или несколько person_id не найдены' }, { status: 400 })
      }
      throw insertErr
    }

    return NextResponse.json({ added: newIds.length, teacher_ids: newIds })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
