import { flattenPhones } from '@/lib/persons/phone'
import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasAlumniPrivilege } from '@/lib/alumni/permissions'
import { errorResponse } from '@/lib/api/handler'
import { compareNames } from '@/lib/persons/name'
import { todayISO } from '@/lib/dates'
import { parseAlumniInput, mergeAddress } from '@/lib/alumni/input'

/**
 * GET /api/alumni
 *
 * Список выпускников: education_journeys со статусом 'graduated', присоединённые
 * к persons, дополненные полями alumni_profiles (по person_id).
 *
 * Право: alumni.view.
 *
 * Фильтры:
 *   ?search=...  — app-side по persons.full_name/hebrew_name/email/phones
 *                  и подразделению/направлению (как фильтр на экране)
 *
 * Ответ: { alumni: AlumniListItem[] }
 */


function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: serverT('invalid_field_value') }
  return { status: 500, message: error.message ?? serverT('db_error') }
}

// PostgREST молча обрезает выдачу на db-max-rows (~1000). Выпускники копятся по
// всем когортам годами и легко превысят 1000, поэтому и список journeys, и
// добор профилей по person_id читаем/чанкуем постранично.
const PAGE = 1000

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const canView = await hasAlumniPrivilege(session, 'view')
    if (!canView) {
      return apiError('no_view_permission', 403)
    }

    const sb = createServerClient()

    type JourneyRow = {
      id: string
      person_id: string
      opened_at: string | null
      person: unknown
      primary_department: unknown
      specialty: unknown
    }
    const rows: JourneyRow[] = []
    let jOffset = 0
    for (;;) {
      const { data, error } = await sb
        .from('education_journeys')
        .select(`
          id, person_id, opened_at,
          person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, email, phones, photo_url),
          primary_department:departments!education_journeys_primary_department_id_fkey(id, name),
          specialty:specialties!education_journeys_specialty_id_fkey(id, name)
        `)
        .eq('education_status', 'graduated')
        // Удалённые (мягко, кнопкой «מחיקה» в карточке) в списке не показываем.
        .eq('is_deleted', false)
        .order('opened_at', { ascending: false })
        .order('id', { ascending: true })
        .range(jOffset, jOffset + PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as JourneyRow[]
      rows.push(...page)
      if (page.length < PAGE) break
      jOffset += PAGE
    }
    const personIds = Array.from(
      new Set(rows.map(j => (j.person as { id?: string } | null)?.id ?? j.person_id).filter(Boolean))
    ) as string[]

    // Профили выпускников (наполняются RPC при выпуске) — по person_id.
    const profileMap = new Map<string, {
      id: string
      graduation_year: number | null
      institution: string | null
      direction: string | null
      current_location: string | null
      current_occupation: string | null
      notes: string | null
    }>()
    // Чанкуем personIds по PAGE: единый .in() сверх ~1000 id молча обрезался бы
    // на db-max-rows (часть выпускников осталась бы без профиля) и раздувал URL.
    for (let i = 0; i < personIds.length; i += PAGE) {
      const batch = personIds.slice(i, i + PAGE)
      const { data: profiles, error: profErr } = await sb
        .from('alumni_profiles')
        .select('id, person_id, graduation_year, institution, direction, current_location, current_occupation, notes')
        .in('person_id', batch)
      if (profErr) throw profErr
      for (const p of profiles ?? []) {
        profileMap.set(p.person_id, {
          id: p.id,
          graduation_year: p.graduation_year,
          institution: p.institution,
          direction: p.direction,
          current_location: p.current_location,
          current_occupation: p.current_occupation,
          notes: p.notes,
        })
      }
    }

    let alumni = rows.map(j => {
      const person = j.person as {
        id?: string
        full_name?: string | null
        hebrew_name?: string | null
        email?: string | null
        phones?: unknown
        photo_url?: string | null
      } | null
      const pid = person?.id ?? j.person_id
      const profile = pid ? profileMap.get(pid) ?? null : null
      const dept = j.primary_department as { name?: string | null } | null
      const spec = j.specialty as { name?: string | null } | null
      return {
        journey_id: j.id,
        person_id: pid,
        full_name: person?.full_name ?? '',
        hebrew_name: person?.hebrew_name ?? null,
        email: person?.email ?? null,
        phones: flattenPhones(person?.phones),
        photo_url: person?.photo_url ?? null,
        alumni_profile_id: profile?.id ?? null,
        // Приоритет — сохранённый профиль; иначе разворачиваем из journey.
        graduation_year: profile?.graduation_year ?? null,
        institution: profile?.institution ?? dept?.name ?? null,
        direction: profile?.direction ?? spec?.name ?? null,
        current_location: profile?.current_location ?? null,
        current_occupation: profile?.current_occupation ?? null,
        notes: profile?.notes ?? null,
      }
    })

    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase()
    if (search) {
      alumni = alumni.filter(a =>
        a.full_name.toLowerCase().includes(search) ||
        (a.hebrew_name ?? '').toLowerCase().includes(search) ||
        (a.email ?? '').toLowerCase().includes(search) ||
        a.phones.join(' ').toLowerCase().includes(search) ||
        (a.institution ?? '').toLowerCase().includes(search) ||
        (a.direction ?? '').toLowerCase().includes(search)
      )
    }

    // По алфавиту — по имени, которое список показывает (full_name).
    alumni.sort((a, b) => compareNames(a.full_name || a.hebrew_name, b.full_name || b.hebrew_name))

    // Экран показывает «+ בוגרת חדשה» только тем, у кого есть alumni.manage.
    const canManage = await hasAlumniPrivilege(session, 'manage')

    return NextResponse.json({ alumni, can_manage: canManage })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return errorResponse(m)
    }
    return errorResponse(e)
  }
}

/** Точное сравнение без учёта регистра: экранируем спецсимволы LIKE. */
function likeExact(v: string): string {
  return v.replace(/[\\%_]/g, m => `\\${m}`)
}

/**
 * POST /api/alumni
 *
 * Ручное добавление выпускницы: persons + education_journeys
 * (education_status='graduated') + alumni_profiles + строка в
 * person_status_history.
 *
 * Дубль: если уже есть человек с той же фамилией, именем и датой рождения
 * (без учёта регистра) — 409 alumni_duplicate, ничего не создаётся.
 *
 * Право: alumni.manage.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await hasAlumniPrivilege(session, 'manage'))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({}))
    const parsed = parseAlumniInput(body, 'create')
    if (!parsed.ok) return apiError(`alumni_${parsed.error}`, 400)
    const { person, address, profile } = parsed

    const sb = createServerClient({ actorPersonId: session.person_id })

    if (person.birth_date) {
      const { data: same, error: dupErr } = await sb
        .from('persons')
        .select('id')
        .ilike('first_name', likeExact(person.first_name!))
        .ilike('last_name', likeExact(person.last_name ?? ''))
        .eq('birth_date', person.birth_date)
        .limit(1)
      if (dupErr) throw dupErr
      if ((same ?? []).length > 0) return apiError('alumni_duplicate', 409)
    }

    const { data: newPerson, error: pErr } = await sb
      .from('persons')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        ...person,
        phones: person.phones ?? [],
        gender: 'female',
        address: address ? mergeAddress(null, address) : null,
      } as any)
      .select('id')
      .single()
    if (pErr || !newPerson) throw pErr ?? new Error('person')

    const today = todayISO()
    const { data: journey, error: jErr } = await sb
      .from('education_journeys')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        person_id: newPerson.id,
        education_status: 'graduated',
        opened_at: today,
      } as any)
      .select('id')
      .single()
    if (jErr || !journey) {
      // Откат: человек без дела не нужен.
      const { error: _rollbackErr } = await sb.from('persons').delete().eq('id', newPerson.id)
      throw jErr ?? new Error('journey')
    }

    const { error: profErr } = await sb
      .from('alumni_profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ person_id: newPerson.id, ...profile } as any)
    if (profErr) throw profErr

    const { error: _histErr } = await sb
      .from('person_status_history')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        person_id: newPerson.id,
        from_status: null,
        to_status: 'graduated',
        changed_by: session.person_id,
        // Текст в базе — по-русски (решение владельца: база на русском).
        comment: 'Добавлена вручную в модуле выпускниц',
      } as any)

    return NextResponse.json({ journey_id: journey.id, person_id: newPerson.id }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) return errorResponse(mapDbError(e))
    return errorResponse(e)
  }
}
