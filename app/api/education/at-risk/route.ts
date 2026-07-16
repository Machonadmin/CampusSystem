import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege, getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * GET /api/education/at-risk?days=30&min=3
 *
 * Проактивный список «в зоне риска»: студентки (education_status='student') с
 * большим числом пропусков (absent) за последние `days` дней. Чтобы секретарь/
 * руководитель увидел, кому нужно внимание, ещё до того как ситуация станет
 * критичной. Возвращает journey_id + имя + подразделение + absent_count/late_count.
 *
 * Право: superadmin или view_students (любой scope). scope='department' —
 * только свои подразделения; 'all'/superadmin — весь институт. Иначе 403.
 * Deploy-safe: отсутствие таблиц (42P01) → { students: [] }.
 */

// PostgREST молча обрезает выдачу на db-max-rows (~1000), а длинный .in()
// упирается в длину URL. Читаем чанками по фильтру + пагинацией внутри чанка.
const PAGE = 1000
const IN_CHUNK = 150

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = any
async function fetchAllByIn<Row>(
  sb: SupabaseClient,
  table: string,
  selectCols: string,
  filterCol: string,
  ids: string[],
  orderCols: string[],
  extra?: (q: Filter) => Filter,
): Promise<Row[]> {
  const out: Row[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK)
    let from = 0
    for (;;) {
      let q: Filter = sb.from(table).select(selectCols).in(filterCol, chunk)
      if (extra) q = extra(q)
      for (const col of orderCols) q = q.order(col, { ascending: true })
      const { data, error } = await q.range(from, from + PAGE - 1)
      if (error) throw error
      const rows = (data ?? []) as unknown as Row[]
      out.push(...rows)
      if (rows.length < PAGE) break
      from += PAGE
    }
  }
  return out
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const n = parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const isSuper = session.roles.includes('superadmin')
    const allowed = isSuper || await hasEducationPrivilege(session, 'view_students')
    if (!allowed) return apiError('forbidden', 403)

    const scope = isSuper ? 'all' : await getEducationPrivilegeScope(session, 'view_students')

    const days = clampInt(request.nextUrl.searchParams.get('days'), 30, 1, 365)
    const min = clampInt(request.nextUrl.searchParams.get('min'), 3, 1, 100)
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

    const sb = createServerClient()

    // scope='department' — ограничиваем подразделениями пользователя.
    let myDepts: string[] | null = null
    if (scope === 'department') {
      myDepts = await getUserDepartmentIds(session.person_id)
      if (myDepts.length === 0) return NextResponse.json({ students: [] })
    }

    // 1. Учебные группы в зоне видимости.
    let gq = sb.from('class_groups').select('id, department_id')
    if (myDepts) gq = gq.in('department_id', myDepts)
    const { data: groupsRaw, error: gErr } = await gq
    if (gErr) throw gErr
    const groupIds = ((groupsRaw ?? []) as Array<{ id: string }>).map(g => g.id)
    if (groupIds.length === 0) return NextResponse.json({ students: [] })

    // 2. Уроки этих групп: не отменённые, за период (scheduled_date >= cutoff).
    const lessonRows = await fetchAllByIn<{ id: string }>(
      sb, 'lessons', 'id', 'class_group_id', groupIds, ['id'],
      q => q.eq('is_cancelled', false).gte('scheduled_date', cutoff),
    )
    const lessonIds = lessonRows.map(l => l.id)
    if (lessonIds.length === 0) return NextResponse.json({ students: [] })

    // 3. Посещаемость: только absent/late. Считаем по journey_id.
    const attRows = await fetchAllByIn<{ id: string; journey_id: string; status: string | null }>(
      sb, 'attendance', 'id, journey_id, status', 'lesson_id', lessonIds, ['id'],
      q => q.in('status', ['absent', 'late']),
    )
    const absentByJourney = new Map<string, number>()
    const lateByJourney = new Map<string, number>()
    for (const r of attRows) {
      if (!r.journey_id) continue
      if (r.status === 'absent') absentByJourney.set(r.journey_id, (absentByJourney.get(r.journey_id) ?? 0) + 1)
      else if (r.status === 'late') lateByJourney.set(r.journey_id, (lateByJourney.get(r.journey_id) ?? 0) + 1)
    }

    // Кандидаты: absent_count >= min.
    const candidateIds = [...absentByJourney.entries()]
      .filter(([, c]) => c >= min)
      .map(([jid]) => jid)
    if (candidateIds.length === 0) return NextResponse.json({ students: [] })

    // 4. Оставляем только активных студенток + имя и подразделение.
    const journeyRows = await fetchAllByIn<{
      id: string
      person: { full_name: string | null; hebrew_name: string | null } | null
      department: { id: string; name: string } | null
    }>(
      sb, 'education_journeys',
      'id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name), department:departments!education_journeys_primary_department_id_fkey(id, name)',
      'id', candidateIds, ['id'],
      q => q.eq('education_status', 'student'),
    )

    const students = journeyRows
      .map(j => ({
        journey_id: j.id,
        name: j.person?.hebrew_name || j.person?.full_name || '',
        department: j.department ? { id: j.department.id, name: j.department.name } : null,
        absent_count: absentByJourney.get(j.id) ?? 0,
        late_count: lateByJourney.get(j.id) ?? 0,
      }))
      .sort((a, b) => b.absent_count - a.absent_count)
      .slice(0, 50)

    return NextResponse.json({ students, days, min })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42P01') return NextResponse.json({ students: [] })
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
