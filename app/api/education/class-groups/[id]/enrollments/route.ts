import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

/**
 * GET /api/education/class-groups/[id]/enrollments
 * Список студентов, записанных в группу.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth()
    const sb = createServerClient()

    const { data, error } = await sb
      .from('class_enrollments')
      .select(`
        student_id,
        class_group_id,
        enrolled_at,
        student:students(
          id,
          status,
          person:persons(id, full_name, hebrew_name, email),
          main_group:study_groups(id, name)
        )
      `)
      .eq('class_group_id', params.id)
      .order('enrolled_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ enrollments: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * POST /api/education/class-groups/[id]/enrollments
 * Записать одного или нескольких студентов в группу.
 *
 * Body: { student_ids: string[] }
 * Право: manage_enrollments в подразделении группы.
 * Идемпотентен: уже записанные пропускаются без ошибок.
 * Возвращает { added, already, total }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as { student_ids?: string[] }
    if (!Array.isArray(body.student_ids) || body.student_ids.length === 0) {
      return NextResponse.json({ error: 'student_ids обязателен (массив)' }, { status: 400 })
    }
    const uniqueIds = Array.from(new Set(body.student_ids))

    const sb = createServerClient()

    const { data: group, error: gErr } = await sb
      .from('class_groups')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (gErr) throw gErr
    if (!group) return NextResponse.json({ error: 'Учебная группа не найдена' }, { status: 404 })

    await requireEducationPrivilege('manage_enrollments', { department_id: group.department_id })

    const { data: existingStudents, error: sErr } = await sb
      .from('students')
      .select('id')
      .in('id', uniqueIds)
    if (sErr) throw sErr

    const existingStudentIds = new Set((existingStudents ?? []).map(s => s.id))
    const missing = uniqueIds.filter(id => !existingStudentIds.has(id))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Студенты не найдены: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    const { data: existingEnrolls, error: eeErr } = await sb
      .from('class_enrollments')
      .select('student_id')
      .eq('class_group_id', params.id)
      .in('student_id', uniqueIds)
    if (eeErr) throw eeErr

    const alreadyEnrolledIds = new Set((existingEnrolls ?? []).map(e => e.student_id))
    const toAdd = uniqueIds.filter(id => !alreadyEnrolledIds.has(id))

    if (toAdd.length > 0) {
      const rows = toAdd.map(student_id => ({ student_id, class_group_id: params.id }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await sb.from('class_enrollments').insert(rows as any)
      if (insErr) {
        if (insErr.code === '23503') {
          return NextResponse.json({ error: 'Ссылка на несуществующую запись' }, { status: 400 })
        }
        throw insErr
      }
    }

    return NextResponse.json({
      added: toAdd.length,
      already: alreadyEnrolledIds.size,
      total: uniqueIds.length,
    }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
