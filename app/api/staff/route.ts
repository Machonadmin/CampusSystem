import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { EmploymentType } from '@/types/database'

async function guard() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

const VALID_EMPLOYMENT: EmploymentType[] = ['staff', 'intern', 'volunteer', 'contractor']

function mapEmploymentType(input: string | undefined): EmploymentType {
  if (!input) return 'staff'
  if (VALID_EMPLOYMENT.includes(input as EmploymentType)) return input as EmploymentType
  // UI exposes additional types we collapse into 'staff' for the DB enum
  if (input === 'part_time' || input === 'hourly') return 'staff'
  return 'staff'
}

export async function POST(request: NextRequest) {
  try {
    await guard()
    const sb = createServerClient()
    const body = await request.json() as {
      full_name?: string
      hebrew_name?: string
      phone?: string
      phones?: string[]
      email?: string
      gender?: string
      birth_date?: string
      marital_status?: string
      citizenship?: string
      address?: Record<string, string>
      contacts?: { type: string; value: string }[]
      department_id?: string
      position?: string
      hire_date?: string
      employment_type?: string
      work_schedule?: string
      passport?: Record<string, unknown>
      education?: Record<string, unknown>
      contract?: Record<string, unknown>
      comment?: string
    }

    if (!body.full_name?.trim()) return NextResponse.json({ error: 'ФИО обязательно' }, { status: 400 })
    if (!body.phone?.trim() && !body.phones?.length) return NextResponse.json({ error: 'Телефон обязателен' }, { status: 400 })
    if (!body.department_id) return NextResponse.json({ error: 'Отдел обязателен' }, { status: 400 })
    if (!body.position?.trim()) return NextResponse.json({ error: 'Должность обязательна' }, { status: 400 })
    if (!body.hire_date) return NextResponse.json({ error: 'Дата приёма обязательна' }, { status: 400 })

    const allPhones = (body.phones?.filter(p => p.trim()) ?? []).length > 0
      ? body.phones!.filter(p => p.trim())
      : (body.phone ? [body.phone.trim()] : [])

    const { data: newPerson, error: personErr } = await sb
      .from('persons')
      .insert({
        full_name: body.full_name.trim(),
        hebrew_name: body.hebrew_name?.trim() || null,
        phones: allPhones,
        email: body.email?.trim() || null,
        gender: (body.gender as 'male' | 'female' | 'other') || null,
        birth_date: body.birth_date || null,
        photo_url: null,
        address: body.address ?? {},
        notes: null,
      })
      .select('id')
      .single()

    if (personErr || !newPerson) throw personErr ?? new Error('Ошибка создания человека')
    const personId = newPerson.id

    const profileNotes = {
      marital_status: body.marital_status,
      citizenship: body.citizenship,
      contacts: body.contacts,
      work_schedule: body.work_schedule,
      passport: body.passport,
      education: body.education,
      contract: body.contract,
      comment: body.comment,
    }
    const cleanedNotes: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(profileNotes)) {
      if (v !== undefined && v !== null && v !== '') cleanedNotes[k] = v
    }

    const { error: profileErr } = await sb.from('staff_profiles').insert({
      person_id: personId,
      employment_type: mapEmploymentType(body.employment_type),
      hire_date: body.hire_date,
      fire_date: null,
      notes: Object.keys(cleanedNotes).length > 0 ? JSON.stringify(cleanedNotes) : null,
    })
    if (profileErr) throw profileErr

    const { error: posErr } = await sb.from('staff_positions').insert({
      person_id: personId,
      department_id: body.department_id,
      position_ru: body.position.trim(),
      position_he: null,
      is_head: false,
      start_date: body.hire_date,
      end_date: null,
    })
    if (posErr) throw posErr

    return NextResponse.json({ person_id: personId }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
