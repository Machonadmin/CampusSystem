import { NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getEducationStructureContainerFilter } from '@/lib/education/permissions'
import { errorResponse } from '@/lib/api/handler'
import { getCookieLocale } from '@/lib/i18n/locale'
import { localizedDeptName } from '@/lib/departments/localized-name'

/**
 * GET /api/education/institutions
 * Список учебных заведений (departments с is_educational_institution=true).
 *
 * Право: любой авторизованный пользователь.
 * Ответ: [{ id, name }] — name на языке интерфейса, отсортировано по нему.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    // Штатный справочник — не для портального токена студентки.
    if (session.principal === 'student') return apiError('forbidden', 403)

    // Видимость по юниту: менеджер со scope='department' видит только заведения
    // своей вертикали (юнит + под-единицы + заведение-контейнер над ним), а не
    // все колледжи института (см. getEducationStructureContainerFilter).
    const myDepts = await getEducationStructureContainerFilter(session)
    if (myDepts && myDepts.length === 0) return NextResponse.json({ institutions: [] })

    const sb = createServerClient()

    let qb = sb
      .from('departments')
      .select('id, name, name_he, name_en')
      .eq('is_educational_institution', true)
    if (myDepts) qb = qb.in('id', myDepts)

    const { data, error } = await qb
    if (error) throw error

    // Имя заведения — на языке интерфейса (name_he/name_en, откат к name),
    // сортировка — по показанному имени.
    const lang = getCookieLocale()
    const institutions = (data ?? [])
      .map(d => ({ id: d.id, name: localizedDeptName(d, lang) }))
      .sort((a, b) => a.name.localeCompare(b.name, lang))
    return NextResponse.json({ institutions })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
