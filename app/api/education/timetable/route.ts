import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege, getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'
import { detectScheduleConflicts, type SlotForConflict } from '@/lib/education/schedule-conflicts'
import { effectiveTeacherIds } from '@/lib/education/slot-fields'

/**
 * GET /api/education/timetable?unit=<departmentId>
 * Кампусное недельное расписание: все слоты (class_schedule_slots) учебных групп
 * (опц. одной единицы) + класс/предмет/учителя/комната + найденные КОНФЛИКТЫ
 * (двойное бронирование учителя или комнаты в пересекающееся время одного дня).
 *
 * Право: view_students (any scope) или superadmin.
 */
type SB = ReturnType<typeof createServerClient>
interface UnitOption { id: string; name: string; name_he: string | null; name_en: string | null }

/**
 * Единицы, доступные пользователю, — БЕЗ учёта текущего фильтра ?unit.
 * Считается по активным учебным группам в рамках его scope, поэтому список
 * одинаков при любом выбранном фильтре и при пустой выдаче: селектор не
 * схлопывается и из «единицы без групп» всегда есть путь назад.
 */
async function allowedUnits(
  sb: SB,
  allowedDeptIds: string[] | null,
  allowedGroupIds: string[] | null,
): Promise<UnitOption[]> {
  let q = sb.from('class_groups')
    .select('department:departments(id, name, name_he, name_en)')
    .eq('is_active', true)
  if (allowedDeptIds) q = q.in('department_id', allowedDeptIds)
  if (allowedGroupIds) q = q.in('id', allowedGroupIds)
  const { data, error } = await q
  if (error) return []
  const rows = (data ?? []) as unknown as Array<{ department: UnitOption | null }>
  return [...new Map(rows.filter(r => r.department).map(r => [r.department!.id, r.department!])).values()]
    .map(d => ({ id: d.id, name: d.name, name_he: d.name_he, name_en: d.name_en }))
    .sort((a, b) => (a.name_he || a.name).localeCompare(b.name_he || b.name, 'he'))
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const isSuper = session.roles.includes('superadmin')
    if (!isSuper && !(await hasEducationPrivilege(session, 'view_students'))) return apiError('forbidden', 403)
    // Может ли двигать слоты (drag-drop). Точную проверку по каждому слоту делает
    // PATCH; это лишь признак «показывать ли перетаскивание».
    const canEdit = isSuper || await hasEducationPrivilege(session, 'set_lesson_topics')

    const sb = createServerClient()
    const unit = (request.nextUrl.searchParams.get('unit') ?? '').trim()

    // Ограничение по праву: scope='all'/superadmin — весь институт; 'department' —
    // только свои подразделения; 'own' — только группы, которые ведёт сам.
    const scope = isSuper ? 'all' : await getEducationPrivilegeScope(session, 'view_students')
    let allowedDeptIds: string[] | null = null
    let allowedGroupIds: string[] | null = null
    if (scope === 'department') {
      allowedDeptIds = await getUserDepartmentIds(session.person_id)
      if (allowedDeptIds.length === 0) return NextResponse.json({ slots: [], conflicts: [], units: [], can_edit: canEdit })
    } else if (scope === 'own') {
      const { data: ct } = await sb.from('class_teachers').select('class_group_id').eq('teacher_id', session.person_id)
      allowedGroupIds = [...new Set((ct ?? []).map(r => r.class_group_id as string))]
      if (allowedGroupIds.length === 0) return NextResponse.json({ slots: [], conflicts: [], units: [], can_edit: canEdit })
    }

    // Список единиц для фильтра считаем ОТДЕЛЬНО и БЕЗ фильтра ?unit — это
    // «какие единицы мне вообще доступны», а не «какие попали в текущую
    // выборку». Раньше он выводился из уже отфильтрованных групп, поэтому выбор
    // единицы без активных групп опустошал сам селектор, и вернуться было
    // некуда. Имена локализуемые (name_he/name_en), иначе в списке «сырое»
    // русское имя отдела.
    const unitOptions = await allowedUnits(sb, allowedDeptIds, allowedGroupIds)

    // Группы (опц. по единице, с учётом ограничения scope) → их id.
    let groupsQ = sb.from('class_groups').select('id, name, department_id, subject:subjects(name), department:departments(id, name, name_he, name_en)').eq('is_active', true)
    if (unit) groupsQ = groupsQ.eq('department_id', unit)
    if (allowedDeptIds) groupsQ = groupsQ.in('department_id', allowedDeptIds)
    if (allowedGroupIds) groupsQ = groupsQ.in('id', allowedGroupIds)
    const { data: groupsRaw } = await groupsQ
    type Dept = { id: string; name: string; name_he: string | null; name_en: string | null }
    const groups = (groupsRaw ?? []) as unknown as Array<{ id: string; name: string; department_id: string | null; subject: { name: string } | null; department: Dept | null }>
    const groupById = new Map(groups.map(g => [g.id, g]))
    const groupIds = groups.map(g => g.id)
    if (groupIds.length === 0) return NextResponse.json({ slots: [], conflicts: [], units: unitOptions, can_edit: canEdit })

    // Слоты + преподаватели этих групп. select('*') — деплой-безопасно
    // (approval_status может отсутствовать до миграции 20260826140000).
    const [{ data: slotsRaw }, { data: teachersRaw }] = await Promise.all([
      sb.from('class_schedule_slots').select('*').in('class_group_id', groupIds),
      sb.from('class_teachers').select('class_group_id, teacher_id, person:persons!class_teachers_teacher_id_fkey(full_name)').in('class_group_id', groupIds),
    ])
    // Отклонённые слоты в расписание не показываем; 'active' и 'pending' — да.
    const slots = ((slotsRaw ?? []) as Array<{ id: string; class_group_id: string; day_of_week: number; start_time: string; end_time: string; room: string | null; approval_status?: string; subject_id?: string | null; teacher_id?: string | null }>)
      .filter(s => (s.approval_status ?? 'active') !== 'rejected')

    const teacherIdsByGroup = new Map<string, string[]>()
    const teacherNameById = new Map<string, string>()
    for (const t of (teachersRaw ?? []) as unknown as Array<{ class_group_id: string; teacher_id: string; person: { full_name: string | null } | null }>) {
      const arr = teacherIdsByGroup.get(t.class_group_id) ?? []
      arr.push(t.teacher_id); teacherIdsByGroup.set(t.class_group_id, arr)
      if (t.person?.full_name) teacherNameById.set(t.teacher_id, t.person.full_name)
    }

    // Состав групп — для конфликта «одни и те же ученицы одновременно».
    // class_enrollments привязан к journey_id → education_journeys.person_id = ученица.
    // Сверяем по person_id (физически один человек не может быть в двух местах).
    // Деплой-безопасно: при ошибке — просто без student-конфликтов.
    const studentIdsByGroup = new Map<string, string[]>()
    try {
      const { data: enr } = await sb.from('class_enrollments').select('class_group_id, journey_id').in('class_group_id', groupIds)
      const rows = (enr ?? []) as Array<{ class_group_id: string; journey_id: string }>
      const journeyIds = [...new Set(rows.map(r => r.journey_id).filter(Boolean))]
      const personByJourney = new Map<string, string>()
      if (journeyIds.length) {
        const { data: jr } = await sb.from('education_journeys').select('id, person_id').in('id', journeyIds)
        for (const j of (jr ?? []) as Array<{ id: string; person_id: string }>) personByJourney.set(j.id, j.person_id)
      }
      for (const e of rows) {
        const pid = personByJourney.get(e.journey_id)
        if (!pid) continue
        const arr = studentIdsByGroup.get(e.class_group_id) ?? []
        arr.push(pid); studentIdsByGroup.set(e.class_group_id, arr)
      }
    } catch { /* без student-конфликтов */ }

    // Собственные предмет/преподаватель слота. Имена тянем одним запросом на
    // каждую сущность; пусто — значит миграция 20260915120000 ещё не применена
    // или слоты ничего своего не задают, и всё падает обратно на группу.
    const slotSubjectIds = [...new Set(slots.map(s => s.subject_id).filter(Boolean) as string[])]
    const slotSubjectNameById = new Map<string, string>()
    if (slotSubjectIds.length > 0) {
      const { data: subs } = await sb.from('subjects').select('id, name').in('id', slotSubjectIds)
      for (const r of (subs ?? []) as Array<{ id: string; name: string }>) slotSubjectNameById.set(r.id, r.name)
    }
    const slotTeacherIds = [...new Set(slots.map(s => s.teacher_id).filter(Boolean) as string[])]
    if (slotTeacherIds.length > 0) {
      const missing = slotTeacherIds.filter(id => !teacherNameById.has(id))
      if (missing.length > 0) {
        const { data: ps } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', missing)
        for (const p of (ps ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
          const name = (p.hebrew_name || p.full_name || '').trim()
          if (name) teacherNameById.set(p.id, name)
        }
      }
    }

    // Действующие преподаватели слота — общий helper (см. lib/education/slot-fields):
    // и вывод сетки, и поиск двойного бронирования обязаны считать одинаково.
    const slotTeachers = (s: { class_group_id: string; teacher_id?: string | null }): string[] =>
      effectiveTeacherIds(s.teacher_id, teacherIdsByGroup.get(s.class_group_id) ?? [])

    const forConflict: SlotForConflict[] = slots.map(s => ({
      id: s.id, day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time,
      room: s.room, teacher_ids: slotTeachers(s),
      student_ids: studentIdsByGroup.get(s.class_group_id) ?? [],
    }))
    const conflicts = detectScheduleConflicts(forConflict)

    const out = slots.map(s => {
      const g = groupById.get(s.class_group_id)
      return {
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        room: s.room,
        class_group_id: s.class_group_id,
        class_group_name: g?.name ?? '',
        // Имя поля не меняется: это по-прежнему «предмет этого урока», просто
        // теперь у слота может быть свой, а группа — запасной вариант.
        subject: (s.subject_id ? slotSubjectNameById.get(s.subject_id) : undefined) ?? g?.subject?.name ?? null,
        unit: g?.department?.name ?? null,
        teachers: slotTeachers(s).map(id => teacherNameById.get(id) ?? '').filter(Boolean),
        // Идентификаторы нужны форме редактирования, чтобы открыться с уже
        // выбранными предметом и преподавателем.
        subject_id: s.subject_id ?? null,
        teacher_id: s.teacher_id ?? null,
        approval_status: (s.approval_status ?? 'active') as 'active' | 'pending',
      }
    })

    return NextResponse.json({ slots: out, conflicts, units: unitOptions, can_edit: canEdit })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
