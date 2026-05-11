import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import {
  hasEducationPrivilege,
  requireEducationPrivilege,
} from '@/lib/education/permissions'
import type { StudentUpdate, StudentStatus } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

const STUDENT_SELECT = `
  *,
  person:persons(id, full_name, hebrew_name, email, phones, gender, birth_date, address, notes),
  main_group:study_groups(id, name, year_level, year_start),
  specialty:specialties(id, name, code),
  department:departments!students_primary_department_id_fkey(id, name)
`

/**
 * GET /api/education/students/[id]
 * Право: view_students с учётом scope (all / department / own).
 * Для scope='own' проверяет, преподаёт ли пользователь в class_group этого студента.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const { data: student, error } = await sb
      .from('students')
      .select(STUDENT_SELECT)
      .eq('id', params.id)
      .maybeSingle()

    if (error) throw error
    if (!student) return NextResponse.json({ error: 'Студент не найден' }, { status: 404 })

    // Собираем teacher_ids для проверки scope='own'
    const { data: enrolls } = await sb
      .from('class_enrollments')
      .select('class_group_id')
      .eq('student_id', params.id)
    const classGroupIds = (enrolls ?? []).map(r => r.class_group_id)

    let teacherIds: string[] = []
    if (classGroupIds.length > 0) {
      const { data: teachers } = await sb
        .from('class_teachers')
        .select('teacher_id')
        .in('class_group_id', classGroupIds)
      teacherIds = (teachers ?? []).map(t => t.teacher_id)
    }

    const allowed = await hasEducationPrivilege(session, 'view_students', {
      department_id: student.primary_department_id,
      teacher_ids: teacherIds,
    })
    if (!allowed) {
      return NextResponse.json({ error: 'Нет прав на просмотр этого студента' }, { status: 403 })
    }

    return NextResponse.json(student)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * PATCH /api/education/students/[id]
 * Право: manage_students в primary_department_id.
 * При переносе в другое подразделение — проверка в обоих.
 * person_id изменять нельзя.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      primary_department_id?: string
      specialty_id?: string | null
      main_group_id?: string | null
      year_level?: number | null
      year_start?: number | null
      enrolled_at?: string
      notes?: string | null
      status?: StudentStatus
    }

    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('students')
      .select('primary_department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return NextResponse.json({ error: 'Студент не найден' }, { status: 404 })

    await requireEducationPrivilege('manage_students', { department_id: current.primary_department_id })

    const newDepartmentId = body.primary_department_id ?? current.primary_department_id
    if (body.primary_department_id && body.primary_department_id !== current.primary_department_id) {
      await requireEducationPrivilege('manage_students', { department_id: body.primary_department_id })
    }

    if (body.specialty_id !== undefined && body.specialty_id !== null) {
      const { data: spec } = await sb
        .from('specialties')
        .select('department_id')
        .eq('id', body.specialty_id)
        .maybeSingle()
      if (!spec) return NextResponse.json({ error: 'Специальность не найдена' }, { status: 400 })
      if (spec.department_id !== newDepartmentId) {
        return NextResponse.json({ error: 'Специальность принадлежит другому подразделению' }, { status: 400 })
      }
    }

    const update: StudentUpdate = {}
    if (body.primary_department_id !== undefined) update.primary_department_id = body.primary_department_id
    if (body.specialty_id !== undefined) update.specialty_id = body.specialty_id
    if (body.main_group_id !== undefined) update.main_group_id = body.main_group_id
    if (body.year_level !== undefined) update.year_level = body.year_level
    if (body.year_start !== undefined) update.year_start = body.year_start
    if (body.enrolled_at !== undefined) update.enrolled_at = body.enrolled_at
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null
    if (body.status !== undefined) update.status = body.status

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const { data, error } = await sb
      .from('students')
      .update(update)
      .eq('id', params.id)
      .select(STUDENT_SELECT)
      .single()

    if (error) {
      if (error.code === '23503') return NextResponse.json({ error: 'Некорректная ссылка' }, { status: 400 })
      throw error
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * DELETE /api/education/students/[id]
 * Мягкое удаление: status → 'expelled'. Запись остаётся в БД.
 * Право: manage_students в primary_department_id.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('students')
      .select('primary_department_id, status')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return NextResponse.json({ error: 'Студент не найден' }, { status: 404 })

    if (current.status === 'expelled') {
      return NextResponse.json({ error: 'Студент уже отчислен' }, { status: 409 })
    }

    await requireEducationPrivilege('manage_students', { department_id: current.primary_department_id })

    const update: StudentUpdate = { status: 'expelled' }
    const { error } = await sb.from('students').update(update).eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true, status: 'expelled' })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
