import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import {
  requireEducationPrivilege,
  getEducationPrivilegeScope,
  getUserDepartmentIds,
} from '@/lib/education/permissions'
import type { StudentInsert, StudentStatus } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '23505') return { status: 409, message: 'Студент с этим person_id уже существует' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

const STUDENT_SELECT = `
  *,
  person:persons(id, full_name, hebrew_name, email, phones, gender, birth_date),
  main_group:study_groups(id, name, year_level),
  specialty:specialties(id, name, code),
  department:departments!students_primary_department_id_fkey(id, name)
`

/**
 * GET /api/education/students
 * Право: view_students.
 *   - scope='all' — видит всех
 *   - scope='department' — фильтр по primary_department_id ∈ мои подразделения
 *   - scope='own' — только студенты class_groups, где пользователь преподаёт
 *
 * Query: department_id, main_group_id, specialty_id, status (default: active+on_leave), search
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth()
    const params = request.nextUrl.searchParams

    const scope = await getEducationPrivilegeScope(session, 'view_students')
    if (!scope) {
      return NextResponse.json({ error: 'Нет прав на просмотр студентов' }, { status: 403 })
    }

    const sb = createServerClient()
    let qb = sb.from('students').select(STUDENT_SELECT)

    if (scope === 'department') {
      const myDepts = await getUserDepartmentIds(session.person_id)
      if (myDepts.length === 0) return NextResponse.json({ students: [] })
      qb = qb.in('primary_department_id', myDepts)
    } else if (scope === 'own') {
      const { data: myClasses, error: clsErr } = await sb
        .from('class_teachers')
        .select('class_group_id')
        .eq('teacher_id', session.person_id)
      if (clsErr) throw clsErr
      const classGroupIds = (myClasses ?? []).map(r => r.class_group_id)
      if (classGroupIds.length === 0) return NextResponse.json({ students: [] })

      const { data: enrolls, error: enrollErr } = await sb
        .from('class_enrollments')
        .select('student_id')
        .in('class_group_id', classGroupIds)
      if (enrollErr) throw enrollErr
      const studentIds = Array.from(new Set((enrolls ?? []).map(r => r.student_id)))
      if (studentIds.length === 0) return NextResponse.json({ students: [] })
      qb = qb.in('id', studentIds)
    }

    const departmentId = params.get('department_id')
    if (departmentId) qb = qb.eq('primary_department_id', departmentId)

    const mainGroupId = params.get('main_group_id')
    if (mainGroupId) qb = qb.eq('main_group_id', mainGroupId)

    const specialtyId = params.get('specialty_id')
    if (specialtyId) qb = qb.eq('specialty_id', specialtyId)

    const statusFilter = params.get('status')
    if (statusFilter && statusFilter !== 'all') {
      qb = qb.eq('status', statusFilter as StudentStatus)
    } else if (!statusFilter) {
      qb = qb.in('status', ['active', 'on_leave'] as StudentStatus[])
    }

    qb = qb.order('created_at', { ascending: false })

    const { data, error } = await qb
    if (error) throw error

    // Поиск на стороне приложения (phones — JSONB, ILIKE через PostgREST неудобен)
    const search = params.get('search')?.trim().toLowerCase()
    let result = data ?? []
    if (search) {
      result = result.filter(s => {
        const p = s.person as {
          full_name?: string | null
          hebrew_name?: string | null
          email?: string | null
          phones?: unknown
        } | null
        if (!p) return false
        return (
          (p.full_name ?? '').toLowerCase().includes(search) ||
          (p.hebrew_name ?? '').toLowerCase().includes(search) ||
          (p.email ?? '').toLowerCase().includes(search) ||
          JSON.stringify(p.phones ?? {}).toLowerCase().includes(search)
        )
      })
    }

    return NextResponse.json({ students: result })
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
 * POST /api/education/students
 * Право: manage_students в primary_department_id.
 *
 * Body: { person_id, ... } ИЛИ { new_person: { full_name, ... }, ... }
 * При new_person — создаём person + student атомарно (откат person при ошибке students).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      person_id?: string
      new_person?: {
        full_name?: string
        hebrew_name?: string
        gender?: string
        birth_date?: string
        email?: string
        phones?: unknown
      }
      primary_department_id?: string
      specialty_id?: string | null
      main_group_id?: string | null
      year_level?: number
      year_start?: number
      enrolled_at?: string
      notes?: string
    }

    if (!body.person_id && !body.new_person) {
      return NextResponse.json({ error: 'Укажите person_id или new_person' }, { status: 400 })
    }
    if (body.person_id && body.new_person) {
      return NextResponse.json({ error: 'Укажите только person_id ИЛИ new_person, не оба' }, { status: 400 })
    }
    if (!body.primary_department_id) {
      return NextResponse.json({ error: 'primary_department_id обязателен' }, { status: 400 })
    }

    await requireEducationPrivilege('manage_students', { department_id: body.primary_department_id })

    const sb = createServerClient()

    if (body.specialty_id) {
      const { data: spec } = await sb
        .from('specialties')
        .select('department_id')
        .eq('id', body.specialty_id)
        .maybeSingle()
      if (!spec) return NextResponse.json({ error: 'Специальность не найдена' }, { status: 400 })
      if (spec.department_id !== body.primary_department_id) {
        return NextResponse.json({ error: 'Специальность принадлежит другому подразделению' }, { status: 400 })
      }
    }

    let personId: string
    let createdPersonId: string | null = null

    if (body.person_id) {
      const { data: existingPerson, error: pErr } = await sb
        .from('persons')
        .select('id')
        .eq('id', body.person_id)
        .maybeSingle()
      if (pErr) throw pErr
      if (!existingPerson) return NextResponse.json({ error: 'Person не найден' }, { status: 400 })
      personId = body.person_id
    } else {
      const np = body.new_person!
      const fullName = np.full_name?.trim()
      if (!fullName) return NextResponse.json({ error: 'new_person.full_name обязателен' }, { status: 400 })

      const { data: newP, error: createErr } = await sb
        .from('persons')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          full_name: fullName,
          hebrew_name: np.hebrew_name?.trim() || null,
          gender: np.gender || null,
          birth_date: np.birth_date || null,
          email: np.email?.trim() || null,
          phones: np.phones ?? [],
          address: {},
          notes: null,
          education_status: 'student',
        } as any)
        .select('id')
        .single()

      if (createErr || !newP) {
        const m = mapDbError(createErr ?? { message: 'Не удалось создать person' })
        return NextResponse.json({ error: `Создание person: ${m.message}` }, { status: m.status })
      }
      personId = newP.id
      createdPersonId = newP.id
    }

    const insert: StudentInsert = {
      person_id: personId,
      primary_department_id: body.primary_department_id,
      specialty_id: body.specialty_id ?? null,
      main_group_id: body.main_group_id ?? null,
      year_level: body.year_level ?? null,
      year_start: body.year_start ?? null,
      enrolled_at: body.enrolled_at ?? new Date().toISOString().slice(0, 10),
      notes: body.notes?.trim() || null,
      status: 'active',
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: student, error: stuErr } = await sb
      .from('students')
      .insert(insert as any)
      .select(STUDENT_SELECT)
      .single()

    if (stuErr) {
      if (createdPersonId) {
        await sb.from('persons').delete().eq('id', createdPersonId)
      }
      const m = mapDbError(stuErr)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    // Если использовали существующий person — обновляем его education_status
    if (body.person_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sb.from('persons').update({ education_status: 'student' } as any).eq('id', personId)
    }

    return NextResponse.json(student, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
