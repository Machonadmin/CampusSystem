import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requirePrivilege } from '@/lib/auth/module-privileges'
import { requirePersonsPrivilege } from '@/lib/persons/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'

export async function GET(request: NextRequest) {
  try {
    // Возвращает PII людей (справочник/пикер) — требуем persons.view,
    // как сиблинг /api/persons/staff (раньше был только логин-гейт).
    await requirePersonsPrivilege('view')

    const { searchParams } = request.nextUrl
    const q = (searchParams.get('search') ?? searchParams.get('q') ?? '').trim()
    const role = searchParams.get('role')
    const departmentId = searchParams.get('department_id')

    const sb = createServerClient()

    // If role=teacher — filter to persons with an active teaching staff_position
    if (role === 'teacher') {
      const { data: teachingPos } = await sb
        .from('reference_positions')
        .select('id')
        .eq('is_teaching', true)
      const teachingIds = (teachingPos ?? []).map(p => p.id)
      if (teachingIds.length === 0) return NextResponse.json({ people: [] })

      let spQuery = sb
        .from('staff_positions')
        .select('person_id')
        .is('end_date', null)
        .in('position_id', teachingIds)
      if (departmentId) spQuery = spQuery.eq('department_id', departmentId)

      const { data: spRows } = await spQuery
      const teacherPersonIds = [...new Set((spRows ?? []).map((r: { person_id: string }) => r.person_id))]
      if (teacherPersonIds.length === 0) return NextResponse.json({ people: [] })

      let qb = sb
        .from('persons')
        .select('id, full_name, email, phones')
        .in('id', teacherPersonIds)
        .order('full_name')
        .limit(50)
      if (q.length >= 2) qb = qb.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)

      const { data } = await qb
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const people = (data ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email ?? null,
        phone: Array.isArray(p.phones) && p.phones.length > 0 ? (p.phones[0]?.number ?? null) : null,
      }))
      return NextResponse.json({ people })
    }

    let qb = sb.from('persons').select('id, full_name, email, phones').order('full_name').limit(15)
    if (q.length >= 2) qb = qb.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)

    const { data } = await qb
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const people = (data ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email ?? null,
      phone: Array.isArray(p.phones) && p.phones.length > 0 ? (p.phones[0]?.number ?? null) : null,
    }))

    return NextResponse.json({ people })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

const personQuickAddSchema = z.object({
  last_name: z.string().trim().nullish(),
  first_name: z.string().trim().optional(),
  middle_name: z.string().trim().nullish(),
  full_name: z.string().trim().optional(), // legacy fallback → first_name (PersonSelect)
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  enroll_as_teacher: z.boolean().optional(),
  department_id: z.string().uuid().optional(),
  position_id: z.string().uuid().optional(),
}).refine(d => d.first_name?.trim() || d.full_name?.trim(), { message: 'Имя обязательно' })

/**
 * POST /api/persons
 *
 * Без enroll_as_teacher: создаёт "голую" персону одним insert — не нужна
 * транзакция, один statement уже атомарен.
 *
 * С enroll_as_teacher: person + staff_profiles + staff_positions — переиспользует
 * тот же RPC create_staff_member, что и /api/staff, вместо отдельной
 * последовательности insert-ов с "warning" вместо отката при сбое.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, personQuickAddSchema)

    const firstName = body.first_name?.trim() || body.full_name?.trim() || ''
    const lastName = body.first_name?.trim() ? (body.last_name?.trim() || null) : null
    const middleName = body.first_name?.trim() ? (body.middle_name?.trim() || null) : null

    if (body.enroll_as_teacher && !body.department_id) {
      throw Object.assign(new Error('Для оформления укажите подразделение'), { status: 400 })
    }

    // Без enroll_as_teacher — создание "голой" персоны (create, без department-таргета).
    // С enroll_as_teacher — департамент проверяется явно: раньше можно было указать
    // любой department_id без проверки прав на него.
    const session = await requirePrivilege(
      'persons', 'create',
      body.enroll_as_teacher ? { department_id: body.department_id } : undefined
    )

    const sb = createServerClient()

    if (!body.enroll_as_teacher) {
      const phones = body.phone?.trim() ? [{ type: 'mobile', number: body.phone.trim() }] : []
      const { data, error } = await sb
        .from('persons')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ last_name: lastName, first_name: firstName, middle_name: middleName, email: body.email?.trim() || null, phones } as any)
        .select('id, full_name, email')
        .single()
      if (error) throw error

      return NextResponse.json({
        id: data.id,
        full_name: data.full_name,
        email: data.email ?? null,
        phone: body.phone?.trim() || null,
      }, { status: 201 })
    }

    let resolvedPositionId = body.position_id ?? null
    if (!resolvedPositionId) {
      const { data: defaultPos } = await sb
        .from('reference_positions')
        .select('id')
        .eq('name_ru', 'Преподаватель')
        .eq('is_active', true)
        .maybeSingle()
      resolvedPositionId = defaultPos?.id ?? null
    }

    const today = new Date().toISOString().split('T')[0]
    const { data: rpcResult, error: rpcErr } = await sb.rpc('create_staff_member', {
      payload: {
        first_name: firstName,
        last_name: lastName,
        middle_name: middleName,
        email: body.email?.trim() || null,
        phones: body.phone?.trim() ? [{ type: 'mobile', number: body.phone.trim() }] : [],
        department_id: body.department_id,
        position_id: resolvedPositionId,
        position: resolvedPositionId ? null : 'Преподаватель',
        hire_date: today,
        employment_type: 'staff',
        actor_id: session.person_id,
      },
    })
    if (rpcErr) throw rpcErr
    const r = rpcResult as { person_id: string; full_name: string }

    return NextResponse.json({
      id: r.person_id,
      full_name: r.full_name,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
    }, { status: 201 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
