import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * GET /api/education/my-groups
 * Учебные группы, которые ведёт текущий пользователь (он в class_teachers).
 * Домашний экран учителя: список «мои группы» с числом студенток. Пусто, если
 * не преподаёт. Не требует управленческих прав — это СВОИ группы преподавателя.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })

    const sb = createServerClient()

    const { data: ct } = await sb.from('class_teachers')
      .select('class_group_id, is_primary').eq('teacher_id', session.person_id)
    const primaryByGroup = new Map<string, boolean>()
    for (const r of (ct ?? []) as Array<{ class_group_id: string; is_primary: boolean | null }>) {
      primaryByGroup.set(r.class_group_id, Boolean(r.is_primary) || (primaryByGroup.get(r.class_group_id) ?? false))
    }
    const groupIds = [...primaryByGroup.keys()]
    if (groupIds.length === 0) return NextResponse.json({ groups: [] })

    const { data: groupsRaw } = await sb.from('class_groups')
      .select('id, name, is_semester, subject:subjects(name, name_he), department:departments(name)')
      .in('id', groupIds)
      .eq('is_active', true)
    const groups = (groupsRaw ?? []) as unknown as Array<{
      id: string; name: string; is_semester: boolean | null
      subject: { name: string; name_he: string | null } | null
      department: { name: string } | null
    }>

    // Число студенток по группам.
    const countByGroup = new Map<string, number>()
    {
      const { data: enr } = await sb.from('class_enrollments').select('class_group_id').in('class_group_id', groupIds)
      for (const r of (enr ?? []) as Array<{ class_group_id: string }>) {
        countByGroup.set(r.class_group_id, (countByGroup.get(r.class_group_id) ?? 0) + 1)
      }
    }

    const out = groups.map(g => ({
      id: g.id,
      name: g.name,
      subject: g.subject ? (g.subject.name_he || g.subject.name) : null,
      unit: g.department?.name ?? null,
      is_semester: Boolean(g.is_semester),
      is_primary: primaryByGroup.get(g.id) ?? false,
      student_count: countByGroup.get(g.id) ?? 0,
    })).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    return NextResponse.json({ groups: out })
  } catch (err: unknown) {
    const e = err as { message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: 500 })
  }
}
