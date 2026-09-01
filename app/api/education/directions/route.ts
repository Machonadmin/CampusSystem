import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getCookieLocale } from '@/lib/i18n/locale'
import { localizedRefName } from '@/lib/education/localized-ref'
import { getEducationContainerDeptFilter } from '@/lib/education/permissions'

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

    // Видимость по юниту: менеджер со scope='department' не может перечислять
    // направления чужого заведения — только те, что в его вертикали.
    const myDepts = await getEducationContainerDeptFilter(session)
    if (myDepts && !myDepts.includes(departmentId)) {
      return NextResponse.json({ directions: [] })
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

    // Мультиязычно: name_he/name_en — если миграция применена; иначе откат.
    const lang = getCookieLocale()
    const full = await sb
      .from('reference_directions')
      .select('id, name_ru, name_he, name_en, code, has_levels, sort_order')
      .eq('department_id', departmentId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    const rows = full.error
      ? ((await sb.from('reference_directions').select('id, name_ru, code, has_levels, sort_order').eq('department_id', departmentId).eq('is_active', true).order('sort_order', { ascending: true })).data ?? [])
      : (full.data ?? [])
    const directions = (rows as Array<{ id: string; name_ru: string; name_he?: string | null; name_en?: string | null; code: string | null; has_levels: boolean; sort_order: number }>)
      .map(d => ({ ...d, name: localizedRefName(d, lang) }))

    return NextResponse.json({ directions })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
