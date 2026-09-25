import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageEducationInAny, getEducationStructureDeptFilter } from '@/lib/education/permissions'
import { errorResponse } from '@/lib/api/handler'
import { monthRange } from '@/lib/finance/staff-comp'
import { actualTeachingHours } from '@/lib/education/teacher-hours'

/**
 * GET /api/education/teachers-hours — «מורים ושעות» для אחראי לимודим.
 *
 * По каждому преподавателю (class_teachers): его группы + недельные слоты
 * (class_schedule_slots) → суммарные недельные часы (Σ(end−start)). Возвращает
 * список, отсортированный по имени, с разбивкой по слотам (для «расписания»).
 * Плюс ФАКТ за выбранный месяц (?year&month, по умолчанию текущий): часы по
 * подтверждённым секретариатом отметкам (решение владельца #5) — тот же расчёт,
 * что и при начислении зарплаты (lib/education/teacher-hours.ts). Замещающая,
 * у которой есть факт по урокам групп в области видимости, тоже попадает в список.
 * Право: view_students где-либо ИЛИ superadmin. Деплой-безопасно.
 */

function toMin(t: string): number {
  const m = t?.match(/^(\d{1,2}):(\d{2})/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

export async function GET(request: NextRequest) {
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

    // Месяц факта (?year&month), по умолчанию — текущий.
    const sp = request.nextUrl.searchParams
    const now = new Date()
    let year = Number(sp.get('year')), month = Number(sp.get('month'))
    if (!Number.isInteger(year) || year < 2000 || year > 2100) year = now.getFullYear()
    if (!Number.isInteger(month) || month < 1 || month > 12) month = now.getMonth() + 1
    const period = { year, month }

    // Область по подразделению (как структурные списки): scope='department' →
    // только преподаватели групп своих подразделений (кодеш и т.п.), 'all' → все.
    const myDepts = await getEducationStructureDeptFilter(session)
    if (myDepts && myDepts.length === 0) return NextResponse.json({ teachers: [], period, actual_no_end_time: 0 })

    const sb = createServerClient()

    // 1. Пары преподаватель↔группа.
    const { data: ct } = await sb.from('class_teachers').select('teacher_id, class_group_id')
    let links = (ct ?? []) as Array<{ teacher_id: string; class_group_id: string }>
    if (links.length === 0) return NextResponse.json({ teachers: [], period, actual_no_end_time: 0 })

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
        if (links.length === 0) return NextResponse.json({ teachers: [], period, actual_no_end_time: 0 })
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

    // 4. Слоты этих групп. select('*') — деплой-безопасно: teacher_id добавлен
    // миграцией 20260915120000 и может ещё отсутствовать.
    type Slot = { class_group_id: string; day_of_week: number; start_time: string; end_time: string; room: string | null; teacher_id?: string | null }
    const slotsByGroup = new Map<string, Slot[]>()
    {
      const { data } = await sb.from('class_schedule_slots')
        .select('*')
        .in('class_group_id', groupIds)
      for (const s of (data ?? []) as Slot[]) {
        const a = slotsByGroup.get(s.class_group_id) ?? []
        a.push(s); slotsByGroup.set(s.class_group_id, a)
      }
    }

    // 5. Сборка по преподавателю.
    //
    // Слот с СОБСТВЕННЫМ teacher_id принадлежит только ему; слот без него —
    // всем преподавателям группы (прежнее поведение). Без этого разделения урок,
    // отданный одной преподавательнице, продолжал бы засчитываться в недельные
    // часы каждой её коллеги по группе, и часы у всех были бы завышены.
    const groupsByTeacher = new Map<string, string[]>()
    const addGroup = (tid: string, gid: string) => {
      const a = groupsByTeacher.get(tid) ?? []
      if (!a.includes(gid)) a.push(gid)
      groupsByTeacher.set(tid, a)
    }
    for (const l of links) addGroup(l.teacher_id, l.class_group_id)

    // Преподаватель может вести отдельный слот, не числясь в class_teachers
    // группы (его назначили прямо на урок) — иначе его часы просто пропали бы.
    const slotOnlyTeachers = new Set<string>()
    for (const [gid, arr] of slotsByGroup) {
      for (const sl of arr) {
        if (!sl.teacher_id) continue
        addGroup(sl.teacher_id, gid)
        if (!teacherIds.includes(sl.teacher_id)) slotOnlyTeachers.add(sl.teacher_id)
      }
    }
    // 6. Факт за месяц (все подтверждённые уроки преподавателя — та же цифра,
    // что пойдёт в зарплату). Замещающие без class_teachers добавляются, если
    // у них есть факт по урокам групп в области видимости экрана.
    const { from, to } = monthRange(year, month)
    const actual = await actualTeachingHours(sb, { from, to })
    const actualOnlyTeachers = new Set<string>()
    {
      const known = new Set<string>([...teacherIds, ...slotOnlyTeachers])
      const candidateGroups = new Set<string>()
      for (const [tid, a] of actual.byTeacher) {
        if (known.has(tid)) continue
        for (const it of a.items) if (it.class_group_id) candidateGroups.add(it.class_group_id)
      }
      let inScope: Set<string> | null = null
      if (myDepts && candidateGroups.size > 0) {
        const { data } = await sb.from('class_groups').select('id, department_id').in('id', [...candidateGroups])
        inScope = new Set(((data ?? []) as Array<{ id: string; department_id: string | null }>)
          .filter(g => g.department_id != null && myDepts.includes(g.department_id)).map(g => g.id))
      }
      for (const [tid, a] of actual.byTeacher) {
        if (known.has(tid)) continue
        if (a.items.some(it => it.class_group_id && (!inScope || inScope.has(it.class_group_id)))) actualOnlyTeachers.add(tid)
      }
    }

    const allTeacherIds = [...teacherIds, ...slotOnlyTeachers, ...actualOnlyTeachers]
    const extraNames = [...slotOnlyTeachers, ...actualOnlyTeachers]
    if (extraNames.length > 0) {
      const { data } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', extraNames)
      for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
        nameById.set(p.id, (p.hebrew_name || p.full_name || '').trim())
      }
    }

    const teachers = allTeacherIds.map(tid => {
      const gids = groupsByTeacher.get(tid) ?? []
      const slots = gids.flatMap(gid => (slotsByGroup.get(gid) ?? [])
        .filter(s => (s.teacher_id ? s.teacher_id === tid : true))
        .map(s => ({
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
        actual_hours: actual.byTeacher.get(tid)?.hours ?? 0,
        actual_lessons: actual.byTeacher.get(tid)?.lessons ?? 0,
        actual_no_end_time: actual.byTeacher.get(tid)?.no_end_time ?? 0,
        slots,
      }
    }).sort((a, b) => b.weekly_hours - a.weekly_hours || a.name.localeCompare(b.name, 'he'))

    const actualNoEndTime = teachers.reduce((n, tc) => n + tc.actual_no_end_time, 0)
    return NextResponse.json({ teachers, period, actual_no_end_time: actualNoEndTime })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
