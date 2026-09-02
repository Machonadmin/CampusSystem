import { NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageEducationInAny, getEducationStructureDeptFilter } from '@/lib/education/permissions'

/**
 * GET /api/education/teachers-hours — «מורים ושעות» для אחראי לимודим.
 *
 * По каждому преподавателю (class_teachers): его группы + недельные слоты
 * (class_schedule_slots) → суммарные недельные часы (Σ(end−start)). Возвращает
 * список, отсортированный по имени, с разбивкой по слотам (для «расписания»).
 * Право: view_students где-либо ИЛИ superadmin. Деплой-безопасно.
 */

function toMin(t: string): number {
  const m = t?.match(/^(\d{1,2}):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const isSuper = session.roles.includes('superadmin')
    // Управленческий экран: только менеджер (scope all/department), НЕ рядовой
    // преподаватель (scope='own') — иначе учитель видел бы часы всех коллег.
    const allowed = isSuper
      || await canManageEducationInAny(session, 'view_students')
      || await canManageEducationInAny(session, 'manage_class_teachers')
      || await canManageEducationInAny(session, 'manage_class_groups')
    if (!allowed) return apiError('forbidden', 403)

    // Область по подразделению (как структурные списки): scope='department' →
    // только преподаватели групп своих подразделений (кодеш и т.п.), 'all' → все.
    const myDepts = await getEducationStructureDeptFilter(session)
    if (myDepts && myDepts.length === 0) return NextResponse.json({ teachers: [] })

    const sb = createServerClient()

    // 1. Пары преподаватель↔группа.
    const { data: ct } = await sb.from('class_teachers').select('teacher_id, class_group_id')
    let links = (ct ?? []) as Array<{ teacher_id: string; class_group_id: string }>
    if (links.length === 0) return NextResponse.json({ teachers: [] })

    let groupIds = [...new Set(links.map(l => l.class_group_id))]

    // 3. Названия групп (+ department_id для фильтра по подразделению).
    const groupNameById = new Map<string, string>()
    {
      const { data } = await sb.from('class_groups').select('id, name, department_id').in('id', groupIds)
      const rows = (data ?? []) as Array<{ id: string; name: string; department_id: string | null }>
      const allowedGroups = myDepts
        ? new Set(rows.filter(g => g.department_id != null && myDepts.includes(g.department_id)).map(g => g.id))
        : null
      for (const g of rows) {
        if (allowedGroups && !allowedGroups.has(g.id)) continue
        groupNameById.set(g.id, g.name)
      }
      if (allowedGroups) {
        links = links.filter(l => allowedGroups.has(l.class_group_id))
        if (links.length === 0) return NextResponse.json({ teachers: [] })
        groupIds = [...new Set(links.map(l => l.class_group_id))]
      }
    }

    const teacherIds = [...new Set(links.map(l => l.teacher_id))]

    // 2. Имена преподавателей.
    const nameById = new Map<string, string>()
    {
      const { data } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', teacherIds)
      for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
        nameById.set(p.id, (p.hebrew_name || p.full_name || '').trim())
      }
    }

    // 4. Слоты этих групп.
    type Slot = { class_group_id: string; day_of_week: number; start_time: string; end_time: string; room: string | null }
    const slotsByGroup = new Map<string, Slot[]>()
    {
      const { data } = await sb.from('class_schedule_slots')
        .select('class_group_id, day_of_week, start_time, end_time, room')
        .in('class_group_id', groupIds)
      for (const s of (data ?? []) as Slot[]) {
        const a = slotsByGroup.get(s.class_group_id) ?? []
        a.push(s); slotsByGroup.set(s.class_group_id, a)
      }
    }

    // 5. Сборка по преподавателю.
    const groupsByTeacher = new Map<string, string[]>()
    for (const l of links) {
      const a = groupsByTeacher.get(l.teacher_id) ?? []
      if (!a.includes(l.class_group_id)) a.push(l.class_group_id)
      groupsByTeacher.set(l.teacher_id, a)
    }

    const teachers = teacherIds.map(tid => {
      const gids = groupsByTeacher.get(tid) ?? []
      const slots = gids.flatMap(gid => (slotsByGroup.get(gid) ?? []).map(s => ({
        group_name: groupNameById.get(s.class_group_id) ?? '',
        day_of_week: s.day_of_week,
        start_time: s.start_time?.slice(0, 5) ?? '',
        end_time: s.end_time?.slice(0, 5) ?? '',
        room: s.room,
      })))
      const weeklyMinutes = slots.reduce((sum, s) => sum + Math.max(0, toMin(s.end_time) - toMin(s.start_time)), 0)
      slots.sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
      return {
        person_id: tid,
        name: nameById.get(tid) ?? '',
        groups_count: gids.length,
        weekly_hours: Math.round((weeklyMinutes / 60) * 10) / 10,
        slots,
      }
    }).sort((a, b) => b.weekly_hours - a.weekly_hours || a.name.localeCompare(b.name, 'he'))

    return NextResponse.json({ teachers })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
