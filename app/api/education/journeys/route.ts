import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import {
  requireEducationPrivilege,
  hasEducationPrivilege,
  getEducationPrivilegeScope,
  getUserDepartmentIds,
  type EducationPrivilege,
} from '@/lib/education/permissions'
import type {
  EducationJourneyInsert,
  JourneyStatus,
} from '@/types/database'

type EduWriteScope = 'view' | 'manage'

/** Подбирает привилегию по состоянию journey и типу доступа (view/manage). */
function pickPrivilege(status: string | null, scope: EduWriteScope): EducationPrivilege {
  if (status === 'lead')      return scope === 'manage' ? 'manage_leads' : 'view_leads'
  if (status === 'applicant') return scope === 'manage' ? 'manage_applicants' : 'view_applicants'
  return scope === 'manage' ? 'manage_students' : 'view_students'
}

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '23505') return { status: 409, message: 'Запись уже существует' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  if (error.code === '23514') return { status: 400, message: 'Нарушено ограничение БД' }
  if (error.code === '22P02') return { status: 400, message: 'Неверное значение поля (возможно, неподдерживаемый статус)' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

const STUDENT_STATUSES: ReadonlyArray<JourneyStatus> =
  ['student', 'graduated', 'expelled', 'on_leave']

function isStudentStatus(s: string | null): boolean {
  return !!s && (STUDENT_STATUSES as readonly string[]).includes(s)
}

const JOURNEY_SELECT = `
  *,
  person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, email, phones, gender, birth_date),
  primary_department:departments!education_journeys_primary_department_id_fkey(id, name),
  specialty:specialties!education_journeys_specialty_id_fkey(id, name, code),
  main_group:study_groups(id, name, year_level),
  desired_department:departments!education_journeys_desired_department_id_fkey(id, name),
  desired_specialty:specialties!education_journeys_desired_specialty_id_fkey(id, name, code)
`

/**
 * GET /api/education/journeys
 *
 * Список journeys с фильтрами:
 *   ?status=lead|applicant|student|...
 *   ?person_id=...
 *   ?department_id=...   — primary_department для студентов, desired_department иначе
 *   ?main_group_id=...
 *   ?search=...          — app-side filter по persons.full_name/hebrew/email/phones
 *
 * Право: view_students (упрощение шага 2A — единое право на любой статус).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth()
    const params = request.nextUrl.searchParams

    const scope = await getEducationPrivilegeScope(session, 'view_students')
    if (!scope) {
      return NextResponse.json({ error: 'Нет прав на просмотр' }, { status: 403 })
    }

    const sb = createServerClient()
    let qb = sb.from('education_journeys').select(JOURNEY_SELECT)

    const status = params.get('status') as JourneyStatus | null
    if (status) qb = qb.eq('education_status', status)

    const personId = params.get('person_id')
    if (personId) qb = qb.eq('person_id', personId)

    const deptFilter = params.get('department_id')
    if (deptFilter) {
      if (isStudentStatus(status)) {
        qb = qb.eq('primary_department_id', deptFilter)
      } else {
        qb = qb.eq('desired_department_id', deptFilter)
      }
    }

    const mainGroupId = params.get('main_group_id')
    if (mainGroupId) qb = qb.eq('main_group_id', mainGroupId)

    if (scope === 'department') {
      const myDepts = await getUserDepartmentIds(session.person_id)
      if (myDepts.length === 0) return NextResponse.json({ journeys: [] })

      if (isStudentStatus(status)) {
        qb = qb.in('primary_department_id', myDepts)
      } else {
        qb = qb.in('desired_department_id', myDepts)
      }
    }
    // 'own' scope для journeys пока не реализуем (упрощение шага 2A)

    qb = qb.order('opened_at', { ascending: false })

    const { data, error } = await qb
    if (error) throw error

    const search = params.get('search')?.trim().toLowerCase()
    let filtered = data ?? []
    if (search) {
      filtered = filtered.filter(j => {
        const p = j.person as {
          full_name?: string | null
          hebrew_name?: string | null
          email?: string | null
          phones?: unknown
        } | null
        if (!p) return false
        return (
          (p.full_name ?? '').toLowerCase().includes(search) ||
          (p.hebrew_name ?? '').toLowerCase().includes(search) ||
          (p.email ?? '').toLowerCase().includes(search) ||
          JSON.stringify(p.phones ?? {}).toLowerCase().includes(search)
        )
      })
    }

    // Прикрепляем направления (lead_interests с именами справочника) к каждому journey
    const personIds = Array.from(
      new Set(
        filtered
          .map(j => (j.person as { id?: string } | null)?.id ?? (j as { person_id?: string }).person_id)
          .filter((id): id is string => !!id)
      )
    )
    if (personIds.length > 0) {
      const { data: interests } = await sb
        .from('lead_interests')
        .select('person_id, free_text, direction:reference_directions(name_ru, department:departments(name)), level:reference_levels(name_ru)')
        .in('person_id', personIds)

      type InterestOut = { free_text: string | null; direction_name: string | null; level_name: string | null; department_name: string | null }
      const interestMap = new Map<string, InterestOut[]>()
      for (const i of interests ?? []) {
        const dir = (i.direction as unknown) as { name_ru: string; department: { name: string } | null } | null
        const lvl = (i.level as unknown) as { name_ru: string } | null
        if (!interestMap.has(i.person_id)) interestMap.set(i.person_id, [])
        interestMap.get(i.person_id)!.push({
          free_text: i.free_text,
          direction_name: dir?.name_ru ?? null,
          level_name: lvl?.name_ru ?? null,
          department_name: dir?.department?.name ?? null,
        })
      }
      filtered = filtered.map(j => {
        const pid = (j.person as { id?: string } | null)?.id ?? (j as { person_id?: string }).person_id
        return { ...j, interests: (pid && interestMap.get(pid)) || [] }
      })
    }

    return NextResponse.json({ journeys: filtered })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * POST /api/education/journeys
 *
 * Body:
 *   { person_id?, new_person?, education_status, desired_department_id?, primary_department_id?, ... }
 *
 * Право: manage_students (упрощение шага 2A).
 * Department для проверки:
 *   - student-статусы → primary_department_id (обязателен)
 *   - иначе          → desired_department_id (если указан)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await request.json() as {
      person_id?: string
      new_person?: {
        last_name?: string | null
        first_name?: string
        middle_name?: string | null
        full_name?: string   // legacy fallback → first_name
        hebrew_name?: string
        gender?: string
        birth_date?: string
        email?: string
        phones?: unknown
      }
      education_status?: JourneyStatus
      desired_department_id?: string | null
      desired_specialty_id?: string | null
      primary_department_id?: string | null
      specialty_id?: string | null
      main_group_id?: string | null
      year_level?: number | null
      year_start?: number | null
      enrolled_at?: string | null
      opened_at?: string | null
      application_date?: string | null
      referral_source?: string | null
      notes?: string | null
    }

    if (!body.person_id && !body.new_person) {
      return NextResponse.json({ error: 'Укажите person_id или new_person' }, { status: 400 })
    }
    if (body.person_id && body.new_person) {
      return NextResponse.json({ error: 'Укажите только person_id ИЛИ new_person, не оба' }, { status: 400 })
    }
    if (!body.education_status) {
      return NextResponse.json({ error: 'education_status обязателен' }, { status: 400 })
    }

    const status = body.education_status

    let deptForCheck: string | null = null
    if (isStudentStatus(status)) {
      deptForCheck = body.primary_department_id ?? null
      if (!deptForCheck) {
        return NextResponse.json({ error: 'primary_department_id обязателен для студента' }, { status: 400 })
      }
    } else {
      deptForCheck = body.desired_department_id ?? null
    }

    const priv = pickPrivilege(status, 'manage')
    if (deptForCheck) {
      await requireEducationPrivilege(priv, { department_id: deptForCheck })
    } else {
      const allowed = await hasEducationPrivilege(session, priv, {})
      if (!allowed) {
        return NextResponse.json({ error: 'Нет прав на создание journey' }, { status: 403 })
      }
    }

    const sb = createServerClient()

    if (body.specialty_id) {
      const { data: spec } = await sb
        .from('specialties')
        .select('department_id')
        .eq('id', body.specialty_id)
        .maybeSingle()
      if (!spec) return NextResponse.json({ error: 'Специальность не найдена' }, { status: 400 })
      if (body.primary_department_id && spec.department_id !== body.primary_department_id) {
        return NextResponse.json({ error: 'Специальность принадлежит другому подразделению' }, { status: 400 })
      }
    }

    let personId: string
    let createdPersonId: string | null = null

    if (body.person_id) {
      const { data: existing } = await sb
        .from('persons')
        .select('id')
        .eq('id', body.person_id)
        .maybeSingle()
      if (!existing) return NextResponse.json({ error: 'Person не найден' }, { status: 400 })
      personId = body.person_id
    } else {
      const np = body.new_person!
      const npFirstName = np.first_name?.trim() || np.full_name?.trim() || ''
      if (!npFirstName) return NextResponse.json({ error: 'new_person: укажите имя' }, { status: 400 })
      const npLastName   = np.first_name?.trim() ? (np.last_name?.trim() || null) : null
      const npMiddleName = np.first_name?.trim() ? (np.middle_name?.trim() || null) : null

      const { data: newP, error: createErr } = await sb
        .from('persons')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          last_name: npLastName,
          first_name: npFirstName,
          middle_name: npMiddleName,
          hebrew_name: np.hebrew_name?.trim() || null,
          gender: np.gender || null,
          birth_date: np.birth_date || null,
          email: np.email?.trim() || null,
          phones: np.phones ?? [],
          address: {},
          notes: null,
          education_status: status,
        } as any)
        .select('id')
        .single()
      if (createErr || !newP) {
        const m = mapDbError(createErr ?? { message: 'Не удалось создать person' })
        return NextResponse.json({ error: `Создание person: ${m.message}` }, { status: m.status })
      }
      personId = newP.id
      createdPersonId = newP.id
    }

    const insert: EducationJourneyInsert = {
      person_id: personId,
      education_status: status,
      opened_at: body.opened_at ?? new Date().toISOString().slice(0, 10),
      closed_at: null,
      application_date: body.application_date ?? null,
      interview_date: null,
      decision_date: null,
      referral_source: body.referral_source ?? null,
      rejection_reason: null,
      community_contact_name: null,
      community_contact_role: null,
      community_phone: null,
      community_email: null,
      institution: null,
      direction: null,
      level: null,
      desired_department_id: body.desired_department_id ?? null,
      desired_specialty_id: body.desired_specialty_id ?? null,
      primary_department_id: body.primary_department_id ?? null,
      specialty_id: body.specialty_id ?? null,
      main_group_id: body.main_group_id ?? null,
      year_level: body.year_level ?? null,
      year_start: body.year_start ?? null,
      enrolled_at: body.enrolled_at ?? null,
      status: 'new',
      notes: body.notes?.trim() || null,
    }

    const { data: journey, error: jErr } = await sb
      .from('education_journeys')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insert as any)
      .select(JOURNEY_SELECT)
      .single()

    if (jErr) {
      if (createdPersonId) await sb.from('persons').delete().eq('id', createdPersonId)
      const m = mapDbError(jErr)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    // Если использовали существующий person — синхронизируем его education_status
    if (body.person_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sb.from('persons').update({ education_status: status } as any).eq('id', personId)
    }

    return NextResponse.json(journey, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
