import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requirePrivilege } from '@/lib/auth/module-privileges'
import { requirePersonsPrivilege } from '@/lib/persons/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import type { EmploymentType } from '@/types/database'

export async function GET(request: NextRequest) {
  try {
    // Справочник сотрудников — это PII. Гейтим как сиблинг /api/persons/staff:
    // требуем persons.view (раньше был только логин-гейт).
    await requirePersonsPrivilege('view')
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
      .select('id, full_name, photo_url, email, phones, gender')
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
          gender: person.gender ?? null,
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
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
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

const staffSchema = z.object({
  person_id: z.string().uuid().optional(),
  last_name: z.string().trim().nullish(),
  first_name: z.string().trim().optional(),
  middle_name: z.string().trim().nullish(),
  full_name: z.string().trim().optional(), // legacy fallback → first_name
  hebrew_name: z.string().trim().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  birth_date: z.string().optional(),
  marital_status: z.string().optional(),
  citizenship: z.string().optional(),
  phone: z.string().trim().optional(),
  phones: z.array(z.string().trim()).optional(),
  email: z.string().trim().optional(),
  address: z.record(z.string(), z.string()).optional(),
  contacts: z.array(z.object({ type: z.string(), value: z.string() })).optional(),
  department_id: z.string().uuid(),
  position: z.string().trim().optional(),
  position_id: z.string().uuid().optional(),
  hire_date: z.string().min(1, 'Дата приёма обязательна'),
  employment_type: z.string().optional(),
  work_schedule: z.string().optional(),
  passport: z.object({
    series: z.string().optional(), number: z.string().optional(),
    issue_date: z.string().optional(), issued_by: z.string().optional(),
  }).optional(),
  education: z.object({
    level: z.string().optional(), specialty: z.string().optional(),
    graduation_year: z.number().optional(), certificates: z.string().optional(),
  }).optional(),
  contract: z.object({
    number: z.string().optional(), date: z.string().optional(),
    salary: z.number().optional(), currency: z.string().optional(), file_name: z.string().optional(),
  }).optional(),
  comment: z.string().optional(),
}).refine(d => d.person_id || d.first_name?.trim() || d.full_name?.trim(), {
  message: serverT('full_name_required'),
}).refine(d => d.position_id || d.position?.trim(), {
  message: serverT('position_or_position_id_required'),
})

/**
 * POST /api/staff
 *
 * Создаёт сотрудника целиком: person (новый или существующий) +
 * staff_profiles + staff_positions — атомарно, одной транзакцией через RPC
 * create_staff_member (см. migrations/20260702180000_*.sql). Раньше это были
 * 3 последовательных insert-а без отката при частичном сбое.
 *
 * Право: persons.create, department-scoped по department_id.
 */
export async function POST(request: NextRequest) {
  try {
    const sb = createServerClient()
    const body = await parseBody(request, staffSchema)

    if (!body.person_id) {
      const hasPhone = !!body.phone?.trim() || !!(body.phones && body.phones.some(p => p.trim()))
      if (!hasPhone) {
        throw Object.assign(new Error(serverT('phone_required')), { status: 400 })
      }
    }

    const session = await requirePrivilege('persons', 'create', { department_id: body.department_id })

    // Телефоны храним в КАНОНИЧЕСКОЙ форме [{type, number}] как во всём приложении
    // (persons.phones). Раньше писались голые строки → в других модулях телефон
    // «пропадал» (читатели берут .number). Приводим к объектам.
    const rawPhones = (body.phones?.filter(p => p.trim()) ?? [])
    if (rawPhones.length === 0 && body.phone?.trim()) rawPhones.push(body.phone.trim())
    const allPhones = rawPhones.map(number => ({ type: 'mobile', number: number.trim() }))

    // Дополнительные поля без выделенной колонки уходят в notes как JSON
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

    const { data: rpcResult, error: rpcErr } = await sb.rpc('create_staff_member', {
      payload: {
        person_id: body.person_id ?? null,
        last_name: body.last_name?.trim() || null,
        first_name: body.first_name?.trim() || body.full_name?.trim() || null,
        middle_name: body.middle_name?.trim() || null,
        hebrew_name: body.hebrew_name?.trim() || null,
        gender: body.gender ?? null,
        birth_date: body.birth_date || null,
        marital_status: body.marital_status || null,
        nationality: body.citizenship?.trim() || null,
        passport_number: body.passport?.number?.trim() || null,
        phones: allPhones,
        email: body.email?.trim() || null,
        address: body.address ?? {},
        department_id: body.department_id,
        position_id: body.position_id ?? null,
        position: body.position?.trim() || null,
        hire_date: body.hire_date,
        employment_type: toEmploymentType(body.employment_type),
        notes: Object.keys(extra).length > 0 ? JSON.stringify(extra) : null,
        actor_id: session.person_id,
      },
    })
    if (rpcErr) throw rpcErr
    const r = rpcResult as {
      profile_id: string | null
      person_id: string
      full_name: string
      position: string
      department_id: string
    }

    const { data: dept } = await sb
      .from('departments')
      .select('name')
      .eq('id', r.department_id)
      .single()

    return NextResponse.json({
      profile_id: r.profile_id,
      person_id: r.person_id,
      full_name: r.full_name,
      position: r.position,
      department: dept?.name ?? null,
    }, { status: 201 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
