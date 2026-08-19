import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import type { StudyGroupInsert } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '23505') return { status: 409, message: serverT('base_group_exists') }
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference_dept_or_specialty_full') }
  return { status: 500, message: error.message ?? serverT('db_error') }
}

/**
 * GET /api/education/study-groups
 * Query: department_id (опц.), specialty_id (опц.), active_only (опц., default true)
 * Доступен любому авторизованному — используется в дропдаунах.
 * Возвращает каждую группу с counts.students (число активных студентов).
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const params = request.nextUrl.searchParams
    const departmentId = params.get('department_id')
    const specialtyId = params.get('specialty_id')
    const activeOnly = params.get('active_only') !== 'false'

    const sb = createServerClient()
    let qb = sb
      .from('study_groups')
      .select('*, department:departments(id, name), specialty:specialties(id, name, code)')
      .order('year_level', { nullsFirst: false })
      .order('name')

    if (departmentId) qb = qb.eq('department_id', departmentId)
    if (specialtyId) qb = qb.eq('specialty_id', specialtyId)
    if (activeOnly) qb = qb.eq('is_active', true)

    const { data: groups, error } = await qb
    if (error) throw error
    if (!groups || groups.length === 0) return NextResponse.json({ study_groups: [] })

    const groupIds = groups.map(g => g.id)
    const { data: studentRows, error: cntErr } = await sb
      .from('students')
      .select('main_group_id')
      .in('main_group_id', groupIds)
      .eq('status', 'active')

    if (cntErr) throw cntErr

    const countsByGroup = new Map<string, number>()
    for (const row of studentRows ?? []) {
      if (row.main_group_id) {
        countsByGroup.set(row.main_group_id, (countsByGroup.get(row.main_group_id) ?? 0) + 1)
      }
    }

    const result = groups.map(g => ({
      ...g,
      counts: { students: countsByGroup.get(g.id) ?? 0 },
    }))

    return NextResponse.json({ study_groups: result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * POST /api/education/study-groups
 * Право: manage_study_groups в указанном подразделении.
 * Если указан specialty_id — его department_id должен совпадать с department_id группы.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      name?: string
      name_he?: string
      year_level?: number
      year_start?: number
      notes?: string
      department_id?: string
      specialty_id?: string | null
    }

    const name = body.name?.trim()
    if (!name) return apiError('title_required', 400)
    if (!body.department_id) return apiError('department_id_required', 400)

    await requireEducationPrivilege('manage_study_groups', { department_id: body.department_id })

    const sb = createServerClient()

    if (body.specialty_id) {
      const { data: spec, error: specErr } = await sb
        .from('specialties')
        .select('department_id')
        .eq('id', body.specialty_id)
        .maybeSingle()
      if (specErr) throw specErr
      if (!spec) return apiError('specialty_not_found', 400)
      if (spec.department_id !== body.department_id) {
        return apiError('specialty_other_department', 400)
      }
    }

    const insert: StudyGroupInsert = {
      name,
      name_he: body.name_he?.trim() || null,
      year_level: body.year_level ?? null,
      year_start: body.year_start ?? null,
      notes: body.notes?.trim() || null,
      department_id: body.department_id,
      specialty_id: body.specialty_id ?? null,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('study_groups')
      .insert(insert as any)
      .select('*, department:departments(id, name), specialty:specialties(id, name, code)')
      .single()

    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json({ ...data, counts: { students: 0 } }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
