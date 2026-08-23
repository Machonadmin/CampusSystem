import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny, getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'

/**
 * GET /api/education/assignment-board
 * Данные для доски שיבוץ (drag-and-drop): активные учебные группы с их
 * преподавателями и ученицами, пул всех учениц (student journeys) и пул
 * персонала (staff) для перетаскивания. Только чтение.
 * Доступ: superadmin ИЛИ manage_enrollments / manage_class_teachers где-либо.
 */
function nameOf(p: { full_name: string | null; hebrew_name: string | null }): string {
  // Ивритское имя в приоритете (интерфейс на иврите); רусское full_name — запас.
  return (p.hebrew_name || p.full_name || '').trim()
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })
    if (session.principal === 'student') return NextResponse.json({ error: serverT('forbidden') }, { status: 403 })
    const ok = session.roles.includes('superadmin')
      || await canDoEducationInAny(session, 'manage_enrollments')
      || await canDoEducationInAny(session, 'manage_class_teachers')
    if (!ok) return NextResponse.json({ error: serverT('forbidden') }, { status: 403 })

    const sb = createServerClient()

    // Ограничение по подразделению — как в разделе семестров, чтобы доска показывала
    // те же группы, что и семестровый экран (раньше доска игнорировала scope и
    // показывала группы всех подразделений — утечка). scope='all' → все.
    const isSuper = session.roles.includes('superadmin')
    const scope = isSuper
      ? 'all'
      : ((await getEducationPrivilegeScope(session, 'manage_enrollments'))
        ?? (await getEducationPrivilegeScope(session, 'manage_class_teachers')))
    const myDepts = scope === 'department' ? await getUserDepartmentIds(session.person_id) : null

    // 1. Активные группы (+ является ли это семестром / к какому семестру относится
    // курс — для метки на карточке).
    const { data: groupsRaw } = await sb.from('class_groups')
      .select('id, name, subject_id, department_id, is_semester, parent_semester_id').eq('is_active', true)
    let groups = (groupsRaw ?? []) as Array<{ id: string; name: string; subject_id: string | null; department_id: string | null; is_semester: boolean; parent_semester_id: string | null }>
    if (myDepts) groups = groups.filter(g => g.department_id != null && myDepts.includes(g.department_id))
    const groupIds = groups.map(g => g.id)

    // 2. Предметы / подразделения — имена.
    const subjectName = new Map<string, string>()
    const deptName = new Map<string, string>()
    {
      const subjectIds = [...new Set(groups.map(g => g.subject_id).filter(Boolean))] as string[]
      if (subjectIds.length) {
        const { data } = await sb.from('subjects').select('id, name, name_he').in('id', subjectIds)
        for (const s of (data ?? []) as Array<{ id: string; name: string; name_he: string | null }>) subjectName.set(s.id, s.name_he || s.name)
      }
      const deptIds = [...new Set(groups.map(g => g.department_id).filter(Boolean))] as string[]
      if (deptIds.length) {
        const { data } = await sb.from('departments').select('id, name').in('id', deptIds)
        for (const d of (data ?? []) as Array<{ id: string; name: string }>) deptName.set(d.id, d.name)
      }
    }

    // Имена родительских семестров — для метки «קורס · <семестр>» на карточках курсов.
    const parentSemesterName = new Map<string, string>()
    {
      const parentIds = [...new Set(groups.map(g => g.parent_semester_id).filter(Boolean))] as string[]
      if (parentIds.length) {
        const { data } = await sb.from('class_groups').select('id, name').in('id', parentIds)
        for (const s of (data ?? []) as Array<{ id: string; name: string }>) parentSemesterName.set(s.id, s.name)
      }
    }

    // 3. Преподаватели и записи по группам.
    const teacherIdsByGroup = new Map<string, string[]>()
    const journeyIdsByGroup = new Map<string, string[]>()
    if (groupIds.length) {
      const { data: ct } = await sb.from('class_teachers').select('class_group_id, teacher_id').in('class_group_id', groupIds)
      for (const r of (ct ?? []) as Array<{ class_group_id: string; teacher_id: string }>) {
        const arr = teacherIdsByGroup.get(r.class_group_id) ?? []; arr.push(r.teacher_id); teacherIdsByGroup.set(r.class_group_id, arr)
      }
      const { data: enr } = await sb.from('class_enrollments').select('class_group_id, journey_id').in('class_group_id', groupIds)
      for (const r of (enr ?? []) as Array<{ class_group_id: string; journey_id: string }>) {
        const arr = journeyIdsByGroup.get(r.class_group_id) ?? []; arr.push(r.journey_id); journeyIdsByGroup.set(r.class_group_id, arr)
      }
    }

    // 4. Пул учениц: student journeys → person.
    const { data: journeysRaw } = await sb.from('education_journeys')
      .select('id, person_id').eq('education_status', 'student')
    const studentJourneys = (journeysRaw ?? []) as Array<{ id: string; person_id: string }>
    const personByJourney = new Map(studentJourneys.map(j => [j.id, j.person_id]))

    // 5. Пул персонала: активные staff_positions → person_id.
    const staffPersonIds = new Set<string>()
    {
      const { data } = await sb.from('staff_positions').select('person_id').is('end_date', null)
      for (const r of (data ?? []) as Array<{ person_id: string }>) staffPersonIds.add(r.person_id)
    }

    // 6. Имена всех задействованных persons.
    const allPersonIds = new Set<string>()
    for (const j of studentJourneys) allPersonIds.add(j.person_id)
    for (const id of staffPersonIds) allPersonIds.add(id)
    for (const arr of teacherIdsByGroup.values()) for (const id of arr) allPersonIds.add(id)
    const personName = new Map<string, string>()
    if (allPersonIds.size) {
      const { data } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', [...allPersonIds])
      for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) personName.set(p.id, nameOf(p))
    }

    // 7. Сборка. journey_id → имя ученицы.
    const journeyName = (jid: string) => { const pid = personByJourney.get(jid); return pid ? (personName.get(pid) ?? '') : '' }

    const outGroups = groups.map(g => ({
      id: g.id,
      name: g.name,
      is_semester: g.is_semester,
      parent_name: g.parent_semester_id ? (parentSemesterName.get(g.parent_semester_id) ?? null) : null,
      subject: g.subject_id ? (subjectName.get(g.subject_id) ?? null) : null,
      unit: g.department_id ? (deptName.get(g.department_id) ?? null) : null,
      teachers: (teacherIdsByGroup.get(g.id) ?? []).map(pid => ({ person_id: pid, name: personName.get(pid) ?? '' })).filter(x => x.name),
      students: (journeyIdsByGroup.get(g.id) ?? []).map(jid => ({ journey_id: jid, name: journeyName(jid) })).filter(x => x.name),
    })).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    const studentsPool = studentJourneys
      .map(j => ({ journey_id: j.id, name: personName.get(j.person_id) ?? '' }))
      .filter(x => x.name).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    const teachersPool = [...staffPersonIds]
      .map(pid => ({ person_id: pid, name: personName.get(pid) ?? '' }))
      .filter(x => x.name).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    return NextResponse.json({ groups: outGroups, students: studentsPool, teachers: teachersPool })
  } catch (err: unknown) {
    const e = err as { message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: 500 })
  }
}
