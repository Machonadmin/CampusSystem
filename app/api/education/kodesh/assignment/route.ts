import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'

/**
 * Кафедра иудаики (לימודי קודש). В кодеше КАЖДАЯ студентка должна быть
 * приписана ровно к одной группе кодеша (её כיתה). Здесь глава кодеша
 * назначает каждой студентке её группу и видит, кто ещё не распределён.
 *
 * Группы кодеша — активные class_groups с department_id = KODESH_DEPT_ID.
 * Назначение = class_enrollments в такую группу.
 *
 * Право: canManageUnit(session, KODESH_DEPT_ID) — superadmin, глава кафедры
 * или её делегат. Студентка/посторонний не проходит. Деплой-безопасно к
 * отсутствию таблиц (42P01 → пусто).
 */
const KODESH_DEPT_ID = '9a3d7b3f-3f65-4653-a111-4d5296404a27'

export async function GET(_request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, KODESH_DEPT_ID))) return apiError('forbidden', 403)

    const sb = createServerClient()

    // Группы кодеша: активные class_groups кафедры иудаики.
    let groups: Array<{ id: string; name: string }> = []
    try {
      const { data, error } = await sb
        .from('class_groups')
        .select('id, name')
        .eq('department_id', KODESH_DEPT_ID)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      groups = (data ?? []) as Array<{ id: string; name: string }>
    } catch (e) {
      if ((e as { code?: string }).code !== '42P01') throw e
    }
    const kodeshGroupIds = new Set(groups.map(g => g.id))

    // Все студентки (education_status='student').
    const { data: journeysRaw, error: jErr } = await sb
      .from('education_journeys')
      .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name), department:departments!education_journeys_primary_department_id_fkey(id, name)')
      .eq('education_status', 'student')
    if (jErr) throw jErr
    const journeys = (journeysRaw ?? []) as unknown as Array<{
      id: string
      person: { full_name: string | null; hebrew_name: string | null } | null
      department: { id: string; name: string } | null
    }>

    // Текущее назначение в группу кодеша: journey_id → kodesh_group_id.
    const assignedMap = new Map<string, string>()
    if (journeys.length > 0 && kodeshGroupIds.size > 0) {
      try {
        const { data: enr, error: eErr } = await sb
          .from('class_enrollments')
          .select('journey_id, class_group_id')
          .in('journey_id', journeys.map(j => j.id))
          .in('class_group_id', [...kodeshGroupIds])
        if (eErr) throw eErr
        for (const r of (enr ?? []) as Array<{ journey_id: string; class_group_id: string }>) {
          assignedMap.set(r.journey_id, r.class_group_id)
        }
      } catch (e) {
        if ((e as { code?: string }).code !== '42P01') throw e
      }
    }

    const students = journeys
      .map(j => ({
        journey_id: j.id,
        name: j.person?.hebrew_name || j.person?.full_name || '',
        department: j.department?.name ?? null,
        kodesh_group_id: assignedMap.get(j.id) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'))

    return NextResponse.json({ groups, students })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42P01') return NextResponse.json({ groups: [], students: [] })
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * PUT /api/education/kodesh/assignment
 * Body: { journey_id, group_id } где group_id — id группы кодеша или null (снять).
 *
 * group_id (если не null) обязан принадлежать кафедре иудаики (иначе 400).
 * Действие: удалить существующие class_enrollments студентки во ВСЕ группы
 * кодеша, затем (если group_id не null) вставить новую запись (ON CONFLICT
 * ничего). Итог: студентка в НЕ БОЛЕЕ чем одной группе кодеша.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, KODESH_DEPT_ID))) return apiError('forbidden', 403)

    const body = await request.json() as { journey_id?: string; group_id?: string | null }
    const journeyId = body.journey_id
    const groupId = body.group_id ?? null
    if (!journeyId) return apiError('journey_id_required', 400)

    const sb = createServerClient()

    // Все активные группы кодеша (для валидации целевой и для очистки).
    const { data: kgRaw, error: kgErr } = await sb
      .from('class_groups')
      .select('id')
      .eq('department_id', KODESH_DEPT_ID)
    if (kgErr) throw kgErr
    const kodeshGroupIds = (kgRaw ?? []).map(g => g.id)

    if (groupId !== null && !kodeshGroupIds.includes(groupId)) {
      return apiError('invalid_reference', 400)
    }

    // Снять студентку со всех групп кодеша.
    if (kodeshGroupIds.length > 0) {
      const { error: delErr } = await sb
        .from('class_enrollments')
        .delete()
        .eq('journey_id', journeyId)
        .in('class_group_id', kodeshGroupIds)
      if (delErr) throw delErr
    }

    // Назначить новую группу (идемпотентно).
    if (groupId !== null) {
      const { error: insErr } = await sb
        .from('class_enrollments')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ journey_id: journeyId, class_group_id: groupId } as any, {
          onConflict: 'journey_id,class_group_id',
          ignoreDuplicates: true,
        })
      if (insErr) {
        if (insErr.code === '23503') return apiError('invalid_reference', 400)
        throw insErr
      }
    }

    return NextResponse.json({ ok: true, kodesh_group_id: groupId })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
