import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * GET /api/education/directions?department_id={uuid}
 * Направления учебного заведения (для каскадного селектора).
 *
 * Право: любой авторизованный пользователь.
 * Ответ: [{ id, name_ru, code, has_levels, sort_order }] — только is_active=true,
 *        отсортировано по sort_order.
 *   - department не существует → 404
 *   - department.is_educational_institution=false → пустой массив
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const departmentId = request.nextUrl.searchParams.get('department_id')
    if (!departmentId) {
      return apiError('department_id_required', 400)
    }

    const sb = createServerClient()

    const { data: dept, error: deptErr } = await sb
      .from('departments')
      .select('id, is_educational_institution')
      .eq('id', departmentId)
      .maybeSingle()
    if (deptErr) throw deptErr
    if (!dept) return apiError('institution_not_found', 404)

    if (!dept.is_educational_institution) {
      return NextResponse.json({ directions: [] })
    }

    const { data, error } = await sb
      .from('reference_directions')
      .select('id, name_ru, code, has_levels, sort_order')
      .eq('department_id', departmentId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) throw error

    return NextResponse.json({ directions: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
