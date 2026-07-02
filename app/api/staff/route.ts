import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requirePrivilege } from '@/lib/auth/module-privileges'
import type { EmploymentType } from '@/types/database'

async function guard() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

export async function GET(request: NextRequest) {
  try {
    await guard()
    const sb = createServerClient()

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() ?? ''
    const departmentId = searchParams.get('department')?.trim() ?? ''

    // 1) Current positions (end_date IS NULL), optionally filtered by department
    let posQuery = sb
      .from('staff_positions')
      .select('id, person_id, department_id, position_ru, is_head, start_date')
      .is('end_date', null)
      .order('is_head', { ascending: false })
    if (departmentId) posQuery = posQuery.eq('department_id', departmentId)
    const { data: positions, error: posErr } = await posQuery
    if (posErr) throw posErr
    if (!positions || positions.length === 0) return NextResponse.json([])

    const personIds = [...new Set(positions.map(p => p.person_id))]
    const deptIds = [...new Set(positions.map(p => p.department_id))]

    // 2) Persons (with optional name search)
    let personQuery = sb
      .from('persons')
      .select('id, full_name, photo_url, email, phones')
      .in('id', personIds)
    if (search) personQuery = personQuery.ilike('full_name', `%${search}%`)
    const { data: persons, error: personsErr } = await personQuery
    if (personsErr) throw personsErr

    const personMap = new Map((persons ?? []).map(p => [p.id, p]))

    // 3) Staff profiles (for hire_date, employment_type, fire_date → status)
    const { data: profiles } = await sb
      .from('staff_profiles')
      .select('id, person_id, employment_type, hire_date, fire_date')
      .in('person_id', personIds)

    const profileMap = new Map((profiles ?? []).map(p => [p.person_id, p]))

    // 4) Departments
    const { data: depts } = await sb
      .from('departments')
      .select('id, name')
      .in('id', deptIds)

    const deptMap = new Map((depts ?? []).map(d => [d.id, d.name]))

    // 5) Join — one row per current position
    const result = positions
      .filter(pos => personMap.has(pos.person_id))
      .map(pos => {
        const person = personMap.get(pos.person_id)!
        const profile = profileMap.get(pos.person_id)
        const phones = (person.phones as string[] | null) ?? []
        const status = profile?.fire_date ? 'fired' : 'active'
        return {
          position_id: pos.id,
          profile_id: profile?.id ?? null,
          person_id: person.id,
          full_name: person.full_name,
          photo_url: person.photo_url,
          phone: phones[0] ?? null,
          email: person.email,
          position: pos.position_ru,
          is_head: pos.is_head,
          department_id: pos.department_id,
          department_name: deptMap.get(pos.department_id) ?? null,
          hire_date: profile?.hire_date ?? pos.start_date ?? null,
          employment_type: profile?.employment_type ?? null,
          status,
        }
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name))

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

// Map the richer UI employment options onto the DB enum
const EMPLOYMENT_MAP: Record<string, EmploymentType> = {
  staff: 'staff',
  full_time: 'staff',
  part_time: 'staff',
  hourly: 'staff',
  intern: 'intern',
  volunteer: 'volunteer',
  contractor: 'contractor',
}
function toEmploymentType(input: string | undefined): EmploymentType {
  if (!input) return 'staff'
  return EMPLOYMENT_MAP[input] ?? 'staff'
}

export async function POST(request: NextRequest) {
  try {
    const sb = createServerClient()

    const body = await request.json() as {
      // Existing person
      person_id?: string
      // New person fields (split format, preferred)
      last_name?: string | null
      first_name?: string
      middle_name?: string | null
      // Legacy single-string format (fallback → first_name)
      full_name?: string
      hebrew_name?: string
      gender?: string
      birth_date?: string
      marital_status?: string
      citizenship?: string
      phone?: string
      phones?: string[]
      email?: string
      address?: Record<string, string>
      contacts?: { type: string; value: string }[]
      // Employment
      department_id?: string
      position?: string
      position_id?: string
      hire_date?: string
      employment_type?: string
      work_schedule?: string
      // Documents
      passport?: { series?: string; number?: string; issue_date?: string; issued_by?: string }
      education?: { level?: string; specialty?: string; graduation_year?: number; certificates?: string }
      contract?: { number?: string; date?: string; salary?: number; currency?: string; file_name?: string }
      comment?: string
    }

    // ── Validation ──────────────────────────────────────────────────────────
    if (!body.person_id && !body.first_name?.trim() && !body.full_name?.trim())
      return NextResponse.json({ error: 'ФИО обязательно' }, { status: 400 })
    if (!body.person_id && !body.phone?.trim() && !(body.phones?.some(p => p.trim())))
      return NextResponse.json({ error: 'Телефон обязателен' }, { status: 400 })
    if (!body.department_id)
      return NextResponse.json({ error: 'Отдел обязателен' }, { status: 400 })
    if (!body.position_id && !body.position?.trim())
      return NextResponse.json({ error: 'position или position_id обязательны' }, { status: 400 })
    if (!body.hire_date)
      return NextResponse.json({ error: 'Дата приёма обязательна' }, { status: 400 })

    // department_id уже провалидирован выше — проверяем именно на него, не в общем.
    await requirePrivilege('persons', 'create', { department_id: body.department_id })

    // ── Resolve / create person ─────────────────────────────────────────────
    let personId: string
    let personName: string

    if (body.person_id) {
      const { data: existing } = await sb
        .from('persons')
        .select('id, full_name')
        .eq('id', body.person_id)
        .single()
      if (!existing) return NextResponse.json({ error: 'Человек не найден' }, { status: 404 })
      personId = existing.id
      personName = existing.full_name
    } else {
      const allPhones = (body.phones?.filter(p => p.trim()) ?? [])
      if (allPhones.length === 0 && body.phone?.trim()) allPhones.push(body.phone.trim())

      const newFirstName = body.first_name?.trim() || body.full_name?.trim() || ''
      const newLastName  = body.first_name?.trim() ? (body.last_name?.trim() || null) : null
      const newMiddleName = body.first_name?.trim() ? (body.middle_name?.trim() || null) : null

      const { data: newPerson, error: personErr } = await sb
        .from('persons')
        .insert({
          last_name: newLastName,
          first_name: newFirstName,
          middle_name: newMiddleName,
          hebrew_name: body.hebrew_name?.trim() || null,
          gender: (body.gender as 'male' | 'female' | 'other') || null,
          birth_date: body.birth_date || null,
          marital_status: body.marital_status || null,
          nationality: body.citizenship?.trim() || null,
          passport_number: body.passport?.number?.trim() || null,
          phones: allPhones,
          email: body.email?.trim() || null,
          photo_url: null,
          address: body.address ?? {},
          notes: null,
        })
        .select('id, full_name')
        .single()

      if (personErr || !newPerson) throw personErr ?? new Error('Ошибка создания человека')
      personId = newPerson.id
      personName = newPerson.full_name
    }

    // ── Staff profile ───────────────────────────────────────────────────────
    // Extra fields that have no dedicated column go into notes as JSON
    const extra: Record<string, unknown> = {}
    if (body.work_schedule) extra.work_schedule = body.work_schedule
    if (body.passport?.series || body.passport?.issue_date || body.passport?.issued_by) {
      extra.passport = {
        series: body.passport.series,
        issue_date: body.passport.issue_date,
        issued_by: body.passport.issued_by,
      }
    }
    if (body.education) extra.education = body.education
    if (body.contract) extra.contract = body.contract
    if (body.contacts?.length) extra.contacts = body.contacts
    if (body.comment) extra.comment = body.comment

    const { data: profile, error: profileErr } = await sb
      .from('staff_profiles')
      .insert({
        person_id: personId,
        employment_type: toEmploymentType(body.employment_type),
        hire_date: body.hire_date,
        fire_date: null,
        notes: Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
      })
      .select('id')
      .single()

    if (profileErr) {
      // Ignore duplicate (person already has a staff profile)
      if ((profileErr as { code?: string }).code !== '23505') throw profileErr
    }

    const profileId = profile?.id ?? null

    // ── Resolve position ────────────────────────────────────────────────────
    let positionName = body.position?.trim() || null
    let resolvedPositionId: string | null = body.position_id ?? null

    if (resolvedPositionId) {
      const { data: refPos } = await sb
        .from('reference_positions')
        .select('name_ru')
        .eq('id', resolvedPositionId)
        .maybeSingle()
      if (!refPos) return NextResponse.json({ error: 'Должность не найдена' }, { status: 400 })
      positionName = refPos.name_ru
    }

    // ── Staff position ──────────────────────────────────────────────────────
    const { error: posErr } = await sb.from('staff_positions').insert({
      person_id: personId,
      department_id: body.department_id,
      position_ru: positionName!,
      position_he: null,
      position_id: resolvedPositionId,
      is_head: false,
      start_date: body.hire_date,
      end_date: null,
    })
    if (posErr) throw posErr

    // ── Fetch department name for response ──────────────────────────────────
    const { data: dept } = await sb
      .from('departments')
      .select('name')
      .eq('id', body.department_id)
      .single()

    // ── Status history (education_status enum doesn't include 'staff';
    //    only record if person has no prior education status) ─────────────
    const { data: existingHistory } = await sb
      .from('person_status_history')
      .select('id')
      .eq('person_id', personId)
      .limit(1)

    if (!existingHistory?.length) {
      // Person has no education history — safe to ignore; no valid 'staff' enum value
    }

    return NextResponse.json({
      profile_id: profileId,
      person_id: personId,
      full_name: personName,
      position: positionName,
      department: dept?.name ?? null,
    }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
