import { NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getEducationStructureContainerFilter } from '@/lib/education/permissions'

/**
 * GET /api/education/institutions
 * Список учебных заведений (departments с is_educational_institution=true).
 *
 * Право: любой авторизованный пользователь.
 * Ответ: [{ id, name }] — отсортировано по name.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    // Видимость по юниту: менеджер со scope='department' видит только заведения
    // своей вертикали (юнит + под-единицы + заведение-контейнер над ним), а не
    // все колледжи института (см. getEducationStructureContainerFilter).
    const myDepts = await getEducationStructureContainerFilter(session)
    if (myDepts && myDepts.length === 0) return NextResponse.json({ institutions: [] })

    const sb = createServerClient()

    let qb = sb
      .from('departments')
      .select('id, name')
      .eq('is_educational_institution', true)
      .order('name', { ascending: true })
    if (myDepts) qb = qb.in('id', myDepts)

    const { data, error } = await qb
    if (error) throw error

    return NextResponse.json({ institutions: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
