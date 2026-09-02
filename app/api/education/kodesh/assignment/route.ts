import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { JEWISHNESS_FINAL_APPROVED } from '@/lib/jewishness/two-step'

/**
 * Доступ к управлению кодешем: глава кафедры (canManageUnit) ИЛИ менеджер с
 * управляющим правом по кафедре иудаики (напр. אחראית יהדות с manage_enrollments/
 * manage_class_groups scope='department' на кодеш) — ей is_head не проставляют,
 * но она отвечает за кодеш и должна видеть/распределять уровни.
 */
async function canManageKodesh(session: Parameters<typeof canManageUnit>[0]): Promise<boolean> {
  if (await canManageUnit(session, KODESH_DEPT_ID)) return true
  const target = { department_id: KODESH_DEPT_ID }
  return (await hasEducationPrivilege(session, 'manage_enrollments', target))
    || (await hasEducationPrivilege(session, 'manage_class_groups', target))
}

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
    if (!(await canManageKodesh(session))) return apiError('forbidden', 403)

    const sb = createServerClient()

    // Группы кодеша: активные class_groups кафедры иудаики (8 групп = 6 уровней,
    // уровни 1–2 делятся на потоки school/university — spec §3.1). Сортируем по
    // уровню, затем по потоку. Deploy-safe: нет колонок kodesh_level/kodesh_stream
    // (42703, до миграции) → откат к сортировке по name_he.
    type KGroup = { id: string; name: string; name_he: string | null; name_en: string | null; kodesh_level?: number | null; kodesh_stream?: string | null }
    let groups: KGroup[] = []
    try {
      // Только УРОВНИ (רמות), а не курсы внутри них: курс — class_group с
      // parent_semester_id ≠ NULL. Без этого новые курсы кодеша показались бы
      // как уровни в дропдауне שיבוץ (и студентку можно было бы «шибуцнуть» в курс).
      const baseFilter = (sel: string) => sb
        .from('class_groups')
        .select(sel)
        .eq('department_id', KODESH_DEPT_ID)
        .eq('is_active', true)
        .is('parent_semester_id', null)
      let { data, error } = await baseFilter('id, name, name_he, name_en, kodesh_level, kodesh_stream')
        .order('kodesh_level', { nullsFirst: false })
        .order('kodesh_stream', { nullsFirst: true })
        .order('name_he', { nullsFirst: false })
      if (error && error.code === '42703') {
        const fb = await baseFilter('id, name, name_he, name_en').order('name_he', { nullsFirst: false }).order('name')
        data = fb.data; error = fb.error
      }
      if (error) throw error
      groups = (data ?? []) as unknown as KGroup[]
    } catch (e) {
      if ((e as { code?: string }).code !== '42P01') throw e
    }
    const kodeshGroupIds = new Set(groups.map(g => g.id))

    // Ворота (spec §3.3): в список шибуца кодеша попадают ТОЛЬКО студентки с
    // финально одобренным еврейством (jewishness_status='verified') И завершённым
    // приёмом (education_status='student').
    const { data: journeysRaw, error: jErr } = await sb
      .from('education_journeys')
      .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name), department:departments!education_journeys_primary_department_id_fkey(id, name)')
      .eq('education_status', 'student')
      .eq('jewishness_status', JEWISHNESS_FINAL_APPROVED)
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
    if (!(await canManageKodesh(session))) return apiError('forbidden', 403)

    const body = await request.json() as { journey_id?: string; group_id?: string | null }
    const journeyId = body.journey_id
    const groupId = body.group_id ?? null
    if (!journeyId) return apiError('journey_id_required', 400)

    const sb = createServerClient()

    // Все активные УРОВНИ кодеша (для валидации целевой и для очистки). Только
    // уровни (parent_semester_id NULL) — курсы внутри уровня не являются целью шибуца.
    const { data: kgRaw, error: kgErr } = await sb
      .from('class_groups')
      .select('id')
      .eq('department_id', KODESH_DEPT_ID)
      .is('parent_semester_id', null)
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

    // Назначить новую группу (идемпотентно). Ручное назначение = подтверждено
    // Ханой (spec §3.5): assignment_status='active' + approved_by/at. Deploy-safe:
    // нет колонок (42703, до миграции) → повторяем upsert без них.
    if (groupId !== null) {
      const nowIso = new Date().toISOString()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let { error: insErr } = await (sb.from('class_enrollments') as any)
        .upsert({
          journey_id: journeyId,
          class_group_id: groupId,
          assignment_status: 'active',
          approved_by: session.person_id,
          approved_at: nowIso,
        }, { onConflict: 'journey_id,class_group_id', ignoreDuplicates: false })
      if (insErr && insErr.code === '42703') {
        const retry = await sb
          .from('class_enrollments')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert({ journey_id: journeyId, class_group_id: groupId } as any, {
            onConflict: 'journey_id,class_group_id',
            ignoreDuplicates: true,
          })
        insErr = retry.error
      }
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
