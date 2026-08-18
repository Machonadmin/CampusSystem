import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'

/**
 * GET /api/education/study-tracks — справочник маршрутов второй половины дня.
 * Право: view_students (или superadmin).
 *
 * Видимость по подразделению: scope='all' (напр. head_of_studies, суперадмин,
 * главный секретариат в корневом подразделении) — все маршруты; scope='department'
 * (управляющий/секретарь юнита) — только маршруты своих подразделений
 * (study_tracks.department_id ∈ его дерево подразделений). Маршруты без
 * department_id видны только полному доступу.
 * Защищено к отсутствию таблицы/колонок (42P01/42703).
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })

    const scope = session.roles.includes('superadmin')
      ? 'all'
      : await getEducationPrivilegeScope(session, 'view_students')
    if (!scope) return NextResponse.json({ error: serverT('forbidden') }, { status: 403 })

    let myDepts: string[] | null = null
    if (scope === 'department') {
      myDepts = await getUserDepartmentIds(session.person_id)
      if (myDepts.length === 0) return NextResponse.json({ tracks: [] })
    }

    const sb = createServerClient()
    const cols = 'id, code, name_he, name_ru, name_en, department_id, years_count, sort_order'
    const build = (select: string) => {
      let q = sb.from('study_tracks').select(select).eq('is_active', true)
      if (myDepts) q = q.in('department_id', myDepts)
      return q.order('sort_order', { ascending: true })
    }

    const { data, error } = await build(cols)
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ tracks: [] })
      // Колонка years_count ещё не мигрирована — отдаём без неё (default 4 на клиенте).
      if (error.code === '42703') {
        const fb = await build('id, code, name_he, name_ru, name_en, department_id, sort_order')
        if (fb.error) throw fb.error
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return NextResponse.json({ tracks: ((fb.data ?? []) as any[]).map(tr => ({ ...tr, years_count: 4 })) })
      }
      throw error
    }
    return NextResponse.json({ tracks: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
