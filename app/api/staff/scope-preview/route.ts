import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { expandDepartmentTree, type DepartmentEdge } from '@/lib/permissions/scope'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'

/**
 * GET /api/staff/scope-preview?department_id={uuid}
 *
 * «Тצוגה מקדימה — מה הוא יראה»: для экрана добавления бейл-тафкид показывает С
 * ЖИВЫМИ ДАННЫМИ, что именно увидит человек, ограниченный этим подразделением
 * (scope='department', посадка в department_id). Считает по ПОДДЕРЕВУ юнита
 * (юнит + под-единицы), симметрично реальному фильтру видимости
 * (getUserDepartmentIds → expandDepartmentTree).
 *
 * Особый случай кодеша: глава кафедры кодеша видит ВСЕХ студенток (все учат
 * кодеш) — отражаем это в students_all=true (как lib/education/permissions.ts).
 *
 * Право: superadmin (экран доступен только ему).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)

    const departmentId = request.nextUrl.searchParams.get('department_id')
    if (!departmentId) return apiError('department_id_required', 400)

    const sb = createServerClient()

    // Поддерево юнита (юнит + все под-единицы вниз по parent_id).
    const { data: allDepts } = await sb.from('departments').select('id, parent_id, name')
    const edges = (allDepts ?? []) as Array<DepartmentEdge & { name: string }>
    const subtree = expandDepartmentTree([departmentId], edges)
    const unitName = edges.find(d => d.id === departmentId)?.name ?? null
    const isKodesh = subtree.includes(KODESH_DEPT_ID)

    // Учебные заведения, которые попадают в поддерево (то, что человек увидит в
    // списке заведений/колледжей).
    const institutions = edges
      .filter(d => subtree.includes(d.id))
      .map(d => d.name)

    // Контентные списки — по поддереву.
    const [tracksRes, subjectsRes, groupsRes] = await Promise.all([
      sb.from('study_tracks').select('id, name_he, name_ru, name_en', { count: 'exact' }).in('department_id', subtree).limit(6),
      sb.from('subjects').select('id', { count: 'exact', head: true }).in('department_id', subtree),
      sb.from('class_groups').select('id', { count: 'exact', head: true }).in('department_id', subtree),
    ])

    // Студенты, которых человек увидит. Кодеш → все; иначе — только поддерева.
    // Двумя запросами (без встроенного join students→persons — его нет в
    // сгенерированных типах, tsc его не пропускает).
    let studentsQuery = sb
      .from('students')
      .select('person_id', { count: 'exact' })
      .eq('status', 'active')
      .limit(8)
    if (!isKodesh) studentsQuery = studentsQuery.in('primary_department_id', subtree)
    const studentsRes = await studentsQuery
    const studentPersonIds = (studentsRes.data ?? []).map(s => s.person_id).filter(Boolean)
    const { data: studentPersons } = studentPersonIds.length
      ? await sb.from('persons').select('id, full_name').in('id', studentPersonIds)
      : { data: [] as Array<{ id: string; full_name: string | null }> }

    // Общее число активных студентов — для контекста «сколько СКРЫТО».
    const { count: studentsTotal } = await sb
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')

    const trackName = (t: { name_he: string | null; name_ru: string | null; name_en: string | null }) =>
      t.name_he || t.name_ru || t.name_en || '—'
    const tracks = (tracksRes.data ?? []) as Array<{ name_he: string | null; name_ru: string | null; name_en: string | null }>
    const studentSample = (studentPersons ?? []).map(p => p.full_name ?? '—')

    return NextResponse.json({
      unit_name: unitName,
      is_kodesh: isKodesh,
      institutions,
      tracks: { count: tracksRes.count ?? 0, sample: tracks.map(trackName) },
      subjects_count: subjectsRes.count ?? 0,
      class_groups_count: groupsRes.count ?? 0,
      students: {
        all: isKodesh,
        count: studentsRes.count ?? 0,
        sample: studentSample,
      },
      students_total: studentsTotal ?? 0,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
