import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import type { SubjectInsert } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '23505') return { status: 409, message: serverT('subject_exists') }
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference_department_id') }
  return { status: 500, message: error.message ?? serverT('db_error') }
}

/**
 * GET /api/education/subjects
 * Query: department_id (опц.), active_only (опц., default true)
 * Доступен любому авторизованному — используется в дропдаунах других модулей.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const params = request.nextUrl.searchParams
    const departmentId = params.get('department_id')
    const activeOnly = params.get('active_only') !== 'false'

    const sb = createServerClient()
    let qb = sb
      .from('subjects')
      .select('*, department:departments(id, name)')
      .order('sort_order')
      .order('name')

    if (departmentId) qb = qb.eq('department_id', departmentId)
    if (activeOnly) qb = qb.eq('is_active', true)

    const { data, error } = await qb
    if (error) throw error

    return NextResponse.json({ subjects: data ?? [] })
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
 * POST /api/education/subjects
 * Право: manage_subjects в указанном подразделении.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      name?: string
      name_he?: string
      department_id?: string
      sort_order?: number
    }

    const name = body.name?.trim()
    if (!name) return apiError('title_required', 400)
    if (!body.department_id) return apiError('department_id_required', 400)

    await requireEducationPrivilege('manage_subjects', { department_id: body.department_id })

    const insert: SubjectInsert = {
      name,
      name_he: body.name_he?.trim() || null,
      department_id: body.department_id,
      sort_order: body.sort_order ?? 0,
    }

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('subjects')
      .insert(insert as any)
      .select('*, department:departments(id, name)')
      .single()

    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
