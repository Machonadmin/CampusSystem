import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { EmploymentType } from '@/types/database'

async function guard() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
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
    const session = await guard()
    const sb = createServerClient()

    const body = await request.json() as {
      // Existing person
      person_id?: string
      // New person fields
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
    if (!body.person_id && !body.full_name?.trim())
      return NextResponse.json({ error: 'ФИО обязательно' }, { status: 400 })
    if (!body.person_id && !body.phone?.trim() && !(body.phones?.some(p => p.trim())))
      return NextResponse.json({ error: 'Телефон обязателен' }, { status: 400 })
    if (!body.department_id)
      return NextResponse.json({ error: 'Отдел обязателен' }, { status: 400 })
    if (!body.position?.trim())
      return NextResponse.json({ error: 'Должность обязательна' }, { status: 400 })
    if (!body.hire_date)
      return NextResponse.json({ error: 'Дата приёма обязательна' }, { status: 400 })

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

      const { data: newPerson, error: personErr } = await sb
        .from('persons')
        .insert({
          full_name: body.full_name!.trim(),
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

    // ── Staff position ──────────────────────────────────────────────────────
    const { error: posErr } = await sb.from('staff_positions').insert({
      person_id: personId,
      department_id: body.department_id,
      position_ru: body.position!.trim(),
      position_he: null,
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
      position: body.position!.trim(),
      department: dept?.name ?? null,
    }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
