import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getEducationStructureDeptFilter, canDoEducationInAny } from '@/lib/education/permissions'

/**
 * GET /api/education/study-tracks — справочник маршрутов второй половины дня.
 * Право: любое просмотровое/управляющее education-право (иначе 403).
 *
 * Видимость по подразделению: структурный фильтр — по тому, чем человек
 * УПРАВЛЯЕТ (manage_*), а не по view_students. Иначе «אחראית יהדות» с
 * view_students='all' (нужным для списка студенток) видела бы все מסלולי חול.
 * scope='all' (head_of_studies/суперадмин) — все маршруты; 'department'
 * (менеджер юнита / кодеша) — только маршруты своих подразделений. См.
 * getEducationStructureDeptFilter. Защищено к отсутствию таблицы/колонок.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })

    const allowed =
      (await canDoEducationInAny(session, 'view_students')) ||
      (await canDoEducationInAny(session, 'manage_class_groups')) ||
      (await canDoEducationInAny(session, 'manage_subjects'))
    if (!allowed) return NextResponse.json({ error: serverT('forbidden') }, { status: 403 })

    const myDepts = await getEducationStructureDeptFilter(session)
    if (myDepts && myDepts.length === 0) return NextResponse.json({ tracks: [] })

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
