import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import {
  hasEducationPrivilege,
  requireEducationPrivilege,
} from '@/lib/education/permissions'
import type { EducationJourneyUpdate, JourneyStatus } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '23505') return { status: 409, message: 'Запись уже существует' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  if (error.code === '23514') return { status: 400, message: 'Нарушено ограничение БД' }
  if (error.code === '22P02') return { status: 400, message: 'Неверное значение поля' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

const STUDENT_STATUSES: ReadonlyArray<JourneyStatus> =
  ['student', 'graduated', 'expelled', 'on_leave']

function isStudentStatus(s: string | null | undefined): boolean {
  return !!s && (STUDENT_STATUSES as readonly string[]).includes(s)
}

const JOURNEY_SELECT = `
  *,
  person:persons(id, full_name, hebrew_name, email, phones, gender, birth_date, address, notes),
  primary_department:departments!education_journeys_primary_department_id_fkey(id, name),
  specialty:specialties!education_journeys_specialty_id_fkey(id, name, code),
  main_group:study_groups(id, name, year_level, year_start),
  desired_department:departments!education_journeys_desired_department_id_fkey(id, name),
  desired_specialty:specialties!education_journeys_desired_specialty_id_fkey(id, name, code)
`

/**
 * GET /api/education/journeys/[id]
 * Право: view_students с учётом scope.
 * scope='own' пока не реализован (см. /api/education/journeys/route.ts).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const { data: journey, error } = await sb
      .from('education_journeys')
      .select(JOURNEY_SELECT)
      .eq('id', params.id)
      .maybeSingle()

    if (error) throw error
    if (!journey) return NextResponse.json({ error: 'Journey не найден' }, { status: 404 })

    const j = journey as unknown as {
      education_status: string | null
      primary_department_id: string | null
      desired_department_id: string | null
    }
    const checkDept = isStudentStatus(j.education_status)
      ? j.primary_department_id
      : j.desired_department_id

    const allowed = await hasEducationPrivilege(session, 'view_students', {
      department_id: checkDept ?? undefined,
    })
    if (!allowed) {
      return NextResponse.json({ error: 'Нет прав на просмотр этого journey' }, { status: 403 })
    }

    return NextResponse.json(journey)
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
 * PATCH /api/education/journeys/[id]
 * Право: manage_students в соответствующем department.
 * НЕЛЬЗЯ менять person_id и education_status (для смены статуса будет /transition).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      desired_department_id?: string | null
      desired_specialty_id?: string | null
      primary_department_id?: string | null
      specialty_id?: string | null
      main_group_id?: string | null
      year_level?: number | null
      year_start?: number | null
      enrolled_at?: string | null
      opened_at?: string | null
      application_date?: string | null
      interview_date?: string | null
      decision_date?: string | null
      referral_source?: string | null
      rejection_reason?: string | null
      notes?: string | null
      status?: string | null
    }

    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('education_journeys')
      .select('id, education_status, primary_department_id, desired_department_id, closed_at')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return NextResponse.json({ error: 'Journey не найден' }, { status: 404 })

    const currentDept = isStudentStatus(current.education_status)
      ? current.primary_department_id
      : current.desired_department_id

    await requireEducationPrivilege('manage_students', {
      department_id: currentDept ?? undefined,
    })

    // Если меняется primary/desired department — проверить и новое подразделение
    const newPrimary = body.primary_department_id
    if (newPrimary !== undefined && newPrimary !== null && newPrimary !== current.primary_department_id) {
      await requireEducationPrivilege('manage_students', { department_id: newPrimary })
    }
    const newDesired = body.desired_department_id
    if (newDesired !== undefined && newDesired !== null && newDesired !== current.desired_department_id) {
      await requireEducationPrivilege('manage_students', { department_id: newDesired })
    }

    if (body.specialty_id) {
      const targetDept = body.primary_department_id ?? current.primary_department_id
      const { data: spec } = await sb
        .from('specialties')
        .select('department_id')
        .eq('id', body.specialty_id)
        .maybeSingle()
      if (!spec) return NextResponse.json({ error: 'Специальность не найдена' }, { status: 400 })
      if (targetDept && spec.department_id !== targetDept) {
        return NextResponse.json({ error: 'Специальность принадлежит другому подразделению' }, { status: 400 })
      }
    }

    const update: EducationJourneyUpdate = {}
    if (body.desired_department_id !== undefined) update.desired_department_id = body.desired_department_id
    if (body.desired_specialty_id !== undefined) update.desired_specialty_id = body.desired_specialty_id
    if (body.primary_department_id !== undefined) update.primary_department_id = body.primary_department_id
    if (body.specialty_id !== undefined) update.specialty_id = body.specialty_id
    if (body.main_group_id !== undefined) update.main_group_id = body.main_group_id
    if (body.year_level !== undefined) update.year_level = body.year_level
    if (body.year_start !== undefined) update.year_start = body.year_start
    if (body.enrolled_at !== undefined) update.enrolled_at = body.enrolled_at
    if (body.opened_at !== undefined && body.opened_at !== null) update.opened_at = body.opened_at
    if (body.application_date !== undefined) update.application_date = body.application_date
    if (body.interview_date !== undefined) update.interview_date = body.interview_date
    if (body.decision_date !== undefined) update.decision_date = body.decision_date
    if (body.referral_source !== undefined) update.referral_source = body.referral_source
    if (body.rejection_reason !== undefined) update.rejection_reason = body.rejection_reason
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null
    if (body.status !== undefined) update.status = body.status

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const { data, error } = await sb
      .from('education_journeys')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(update as any)
      .eq('id', params.id)
      .select(JOURNEY_SELECT)
      .single()

    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data)
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
 * DELETE /api/education/journeys/[id]
 * Мягкое: closed_at = сегодня. Если уже closed — 409.
 * Право: manage_students в соответствующем department.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('education_journeys')
      .select('id, education_status, primary_department_id, desired_department_id, closed_at')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return NextResponse.json({ error: 'Journey не найден' }, { status: 404 })

    if (current.closed_at) {
      return NextResponse.json({ error: 'Journey уже закрыт' }, { status: 409 })
    }

    const checkDept = isStudentStatus(current.education_status)
      ? current.primary_department_id
      : current.desired_department_id

    await requireEducationPrivilege('manage_students', {
      department_id: checkDept ?? undefined,
    })

    const today = new Date().toISOString().slice(0, 10)
    const { error } = await sb
      .from('education_journeys')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ closed_at: today } as any)
      .eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true, closed_at: today })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
