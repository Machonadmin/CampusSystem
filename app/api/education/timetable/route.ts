import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege, getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'
import { detectScheduleConflicts, type SlotForConflict } from '@/lib/education/schedule-conflicts'

/**
 * GET /api/education/timetable?unit=<departmentId>
 * Кампусное недельное расписание: все слоты (class_schedule_slots) учебных групп
 * (опц. одной единицы) + класс/предмет/учителя/комната + найденные КОНФЛИКТЫ
 * (двойное бронирование учителя или комнаты в пересекающееся время одного дня).
 *
 * Право: view_students (any scope) или superadmin.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const isSuper = session.roles.includes('superadmin')
    if (!isSuper && !(await hasEducationPrivilege(session, 'view_students'))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const unit = (request.nextUrl.searchParams.get('unit') ?? '').trim()

    // Ограничение по праву: scope='all'/superadmin — весь институт; 'department' —
    // только свои подразделения; 'own' — только группы, которые ведёт сам.
    const scope = isSuper ? 'all' : await getEducationPrivilegeScope(session, 'view_students')
    let allowedDeptIds: string[] | null = null
    let allowedGroupIds: string[] | null = null
    if (scope === 'department') {
      allowedDeptIds = await getUserDepartmentIds(session.person_id)
      if (allowedDeptIds.length === 0) return NextResponse.json({ slots: [], conflicts: [], units: [] })
    } else if (scope === 'own') {
      const { data: ct } = await sb.from('class_teachers').select('class_group_id').eq('teacher_id', session.person_id)
      allowedGroupIds = [...new Set((ct ?? []).map(r => r.class_group_id as string))]
      if (allowedGroupIds.length === 0) return NextResponse.json({ slots: [], conflicts: [], units: [] })
    }

    // Группы (опц. по единице, с учётом ограничения scope) → их id.
    let groupsQ = sb.from('class_groups').select('id, name, department_id, subject:subjects(name), department:departments(id, name)').eq('is_active', true)
    if (unit) groupsQ = groupsQ.eq('department_id', unit)
    if (allowedDeptIds) groupsQ = groupsQ.in('department_id', allowedDeptIds)
    if (allowedGroupIds) groupsQ = groupsQ.in('id', allowedGroupIds)
    const { data: groupsRaw } = await groupsQ
    const groups = (groupsRaw ?? []) as unknown as Array<{ id: string; name: string; department_id: string | null; subject: { name: string } | null; department: { id: string; name: string } | null }>
    const groupById = new Map(groups.map(g => [g.id, g]))
    const groupIds = groups.map(g => g.id)
    if (groupIds.length === 0) return NextResponse.json({ slots: [], conflicts: [] })

    // Слоты + преподаватели этих групп.
    const [{ data: slotsRaw }, { data: teachersRaw }] = await Promise.all([
      sb.from('class_schedule_slots').select('id, class_group_id, day_of_week, start_time, end_time, room').in('class_group_id', groupIds),
      sb.from('class_teachers').select('class_group_id, teacher_id, person:persons!class_teachers_teacher_id_fkey(full_name)').in('class_group_id', groupIds),
    ])
    const slots = (slotsRaw ?? []) as Array<{ id: string; class_group_id: string; day_of_week: number; start_time: string; end_time: string; room: string | null }>

    const teacherIdsByGroup = new Map<string, string[]>()
    const teacherNameById = new Map<string, string>()
    for (const t of (teachersRaw ?? []) as unknown as Array<{ class_group_id: string; teacher_id: string; person: { full_name: string | null } | null }>) {
      const arr = teacherIdsByGroup.get(t.class_group_id) ?? []
      arr.push(t.teacher_id); teacherIdsByGroup.set(t.class_group_id, arr)
      if (t.person?.full_name) teacherNameById.set(t.teacher_id, t.person.full_name)
    }

    const forConflict: SlotForConflict[] = slots.map(s => ({
      id: s.id, day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time,
      room: s.room, teacher_ids: teacherIdsByGroup.get(s.class_group_id) ?? [],
    }))
    const conflicts = detectScheduleConflicts(forConflict)

    const out = slots.map(s => {
      const g = groupById.get(s.class_group_id)
      const tids = teacherIdsByGroup.get(s.class_group_id) ?? []
      return {
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        room: s.room,
        class_group_id: s.class_group_id,
        class_group_name: g?.name ?? '',
        subject: g?.subject?.name ?? null,
        unit: g?.department?.name ?? null,
        teachers: tids.map(id => teacherNameById.get(id) ?? '').filter(Boolean),
      }
    })

    // Список единиц для фильтра.
    const unitOptions = [...new Map(groups.filter(g => g.department).map(g => [g.department!.id, g.department!.name])).entries()]
      .map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    return NextResponse.json({ slots: out, conflicts, units: unitOptions })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
