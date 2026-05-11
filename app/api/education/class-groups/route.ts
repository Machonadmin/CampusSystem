import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import type { ClassGroupInsert } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '23505') return { status: 409, message: 'Учебная группа с таким именем уже существует' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  if (error.code === '23514') {
    if (error.message?.includes('class_groups_period_consistency')) {
      return { status: 400, message: 'period_end должен быть после period_start' }
    }
    if (error.message?.includes('class_groups_max_participants_positive')) {
      return { status: 400, message: 'max_participants должен быть положительным числом' }
    }
    return { status: 400, message: 'Нарушено ограничение БД' }
  }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

const CLASS_GROUP_SELECT = `
  *,
  subject:subjects(id, name, name_he),
  department:departments(id, name)
`

type TeacherEntry = { person_id: string; full_name: string | null; is_primary: boolean }

async function buildTeachersAndCounts(
  sb: ReturnType<typeof createServerClient>,
  groupIds: string[]
): Promise<{
  countsByGroup: Map<string, number>
  teachersByGroup: Map<string, TeacherEntry[]>
}> {
  const [enrollsRes, teachersRes] = await Promise.all([
    sb.from('class_enrollments').select('class_group_id').in('class_group_id', groupIds),
    sb.from('class_teachers')
      .select('class_group_id, teacher_id, is_primary, person:persons(id, full_name)')
      .in('class_group_id', groupIds),
  ])

  if (enrollsRes.error) throw enrollsRes.error
  if (teachersRes.error) throw teachersRes.error

  const countsByGroup = new Map<string, number>()
  for (const row of enrollsRes.data ?? []) {
    countsByGroup.set(row.class_group_id, (countsByGroup.get(row.class_group_id) ?? 0) + 1)
  }

  const teachersByGroup = new Map<string, TeacherEntry[]>()
  for (const row of teachersRes.data ?? []) {
    const person = (row.person as unknown) as { id: string; full_name: string | null } | null
    if (!person) continue
    const entry: TeacherEntry = { person_id: person.id, full_name: person.full_name, is_primary: row.is_primary ?? false }
    const arr = teachersByGroup.get(row.class_group_id) ?? []
    arr.push(entry)
    teachersByGroup.set(row.class_group_id, arr)
  }
  for (const arr of teachersByGroup.values()) {
    arr.sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  }

  return { countsByGroup, teachersByGroup }
}

/**
 * GET /api/education/class-groups
 * Доступен любому авторизованному (для дропдаунов в QC и других модулях).
 *
 * Query: department_id, subject_id, teacher_id, active_only (default true)
 * Возвращает каждую группу с counts.students и teachers[].
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const params = request.nextUrl.searchParams
    const departmentId = params.get('department_id')
    const subjectId = params.get('subject_id')
    const teacherId = params.get('teacher_id')
    const activeOnly = params.get('active_only') !== 'false'

    const sb = createServerClient()

    let groupIdFilter: string[] | null = null
    if (teacherId) {
      const { data: ctRows, error: ctErr } = await sb
        .from('class_teachers')
        .select('class_group_id')
        .eq('teacher_id', teacherId)
      if (ctErr) throw ctErr
      groupIdFilter = (ctRows ?? []).map(r => r.class_group_id)
      if (groupIdFilter.length === 0) return NextResponse.json({ class_groups: [] })
    }

    let qb = sb.from('class_groups').select(CLASS_GROUP_SELECT).order('name')
    if (departmentId) qb = qb.eq('department_id', departmentId)
    if (subjectId) qb = qb.eq('subject_id', subjectId)
    if (activeOnly) qb = qb.eq('is_active', true)
    if (groupIdFilter) qb = qb.in('id', groupIdFilter)

    const { data: groups, error } = await qb
    if (error) throw error
    if (!groups || groups.length === 0) return NextResponse.json({ class_groups: [] })

    const groupIds = groups.map(g => g.id)
    const { countsByGroup, teachersByGroup } = await buildTeachersAndCounts(sb, groupIds)

    const result = groups.map(g => ({
      ...g,
      counts: { students: countsByGroup.get(g.id) ?? 0 },
      teachers: teachersByGroup.get(g.id) ?? [],
    }))

    return NextResponse.json({ class_groups: result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * POST /api/education/class-groups
 * Право: manage_class_groups в указанном подразделении.
 *
 * teacher_ids (или teacher_id) — минимум один обязателен (class_groups.teacher_id NOT NULL).
 * Первый из teacher_ids становится основным (class_groups.teacher_id + is_primary в class_teachers).
 * Предмет должен принадлежать тому же подразделению.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      name?: string
      subject_id?: string
      department_id?: string
      teacher_ids?: string[]
      level?: string
      period_start?: string | null
      period_end?: string | null
      max_participants?: number | null
      notes?: string
    }

    const name = body.name?.trim()
    if (!name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })
    if (!body.subject_id) return NextResponse.json({ error: 'subject_id обязателен' }, { status: 400 })
    if (!body.department_id) return NextResponse.json({ error: 'department_id обязателен' }, { status: 400 })

    const teacherIds = body.teacher_ids ?? []
    if (teacherIds.length === 0) {
      return NextResponse.json({ error: 'Укажите хотя бы одного преподавателя (teacher_ids)' }, { status: 400 })
    }

    await requireEducationPrivilege('manage_class_groups', { department_id: body.department_id })

    const sb = createServerClient()

    const { data: subject, error: sErr } = await sb
      .from('subjects')
      .select('department_id')
      .eq('id', body.subject_id)
      .maybeSingle()
    if (sErr) throw sErr
    if (!subject) return NextResponse.json({ error: 'Предмет не найден' }, { status: 400 })
    if (subject.department_id !== body.department_id) {
      return NextResponse.json({ error: 'Предмет принадлежит другому подразделению' }, { status: 400 })
    }

    const uniqueTeacherIds = Array.from(new Set(teacherIds))

    const insert: ClassGroupInsert = {
      name,
      subject_id: body.subject_id,
      department_id: body.department_id,
      teacher_id: uniqueTeacherIds[0],
      level: body.level?.trim() || null,
      period_start: body.period_start ?? null,
      period_end: body.period_end ?? null,
      max_participants: body.max_participants ?? null,
      notes: body.notes?.trim() || null,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: group, error: insertErr } = await sb
      .from('class_groups')
      .insert(insert as any)
      .select(CLASS_GROUP_SELECT)
      .single()
    if (insertErr) {
      const m = mapDbError(insertErr)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    const session = await getSession()
    const teacherRows = uniqueTeacherIds.map((teacher_id, idx) => ({
      class_group_id: group.id,
      teacher_id,
      is_primary: idx === 0,
      added_by: session?.person_id ?? null,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: ctErr } = await sb.from('class_teachers').insert(teacherRows as any)
    if (ctErr) {
      return NextResponse.json({
        ...group,
        counts: { students: 0 },
        teachers: [],
        warning: 'Группа создана, но не удалось добавить преподавателей',
      }, { status: 201 })
    }

    const teachers: TeacherEntry[] = uniqueTeacherIds.map((id, idx) => ({
      person_id: id,
      full_name: null,
      is_primary: idx === 0,
    }))

    return NextResponse.json({ ...group, counts: { students: 0 }, teachers }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
