import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

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

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const body = await request.json() as {
      // Новый формат
      last_name?: string | null
      first_name?: string
      middle_name?: string | null
      // Легаси-формат (PersonSelect создаёт через full_name)
      full_name?: string
      email?: string
      phone?: string
      enroll_as_teacher?: boolean
      department_id?: string
      position_id?: string
    }
    const { email, phone, enroll_as_teacher, department_id, position_id: positionIdParam } = body

    const firstName = body.first_name?.trim() || body.full_name?.trim() || ''
    if (!firstName) {
      return NextResponse.json({ error: 'Имя обязательно' }, { status: 400 })
    }
    const lastName  = body.first_name?.trim() ? (body.last_name?.trim() || null) : null
    const middleName = body.first_name?.trim() ? (body.middle_name?.trim() || null) : null
    if (enroll_as_teacher && !department_id) {
      return NextResponse.json({ error: 'Для оформления укажите подразделение' }, { status: 400 })
    }

    const sb = createServerClient()
    const phones = phone?.trim() ? [{ type: 'mobile', number: phone.trim() }] : []

    const { data, error } = await sb
      .from('persons')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ last_name: lastName, first_name: firstName, middle_name: middleName, email: email?.trim() || null, phones } as any)
      .select('id, full_name, email')
      .single()

    if (error) throw error

    const personId = data.id
    let warning: string | undefined

    if (enroll_as_teacher && department_id) {
      try {
        const today = new Date().toISOString().split('T')[0]

        // Resolve position
        let resolvedPositionId: string | null = positionIdParam ?? null
        let resolvedPositionRu = 'Преподаватель'

        if (resolvedPositionId) {
          const { data: rp } = await sb.from('reference_positions').select('name_ru').eq('id', resolvedPositionId).maybeSingle()
          if (rp) resolvedPositionRu = rp.name_ru
        } else {
          const { data: defaultPos } = await sb
            .from('reference_positions')
            .select('id, name_ru')
            .eq('name_ru', 'Преподаватель')
            .eq('is_active', true)
            .maybeSingle()
          if (defaultPos) { resolvedPositionId = defaultPos.id; resolvedPositionRu = defaultPos.name_ru }
        }

        // Staff profile (ignore duplicate)
        await sb.from('staff_profiles')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert({ person_id: personId, employment_type: 'staff', hire_date: today, fire_date: null, notes: null } as any)
          .select('id').single().catch(() => null)

        // Staff position
        const { error: posErr } = await sb.from('staff_positions').insert({
          person_id: personId,
          department_id,
          position_id: resolvedPositionId,
          position_ru: resolvedPositionRu,
          position_he: null,
          is_head: false,
          start_date: today,
          end_date: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        if (posErr) warning = 'Человек создан, но оформить как преподавателя не удалось'
      } catch {
        warning = 'Человек создан, но оформить как преподавателя не удалось'
      }
    }

    return NextResponse.json({
      id: data.id,
      full_name: data.full_name,
      email: data.email ?? null,
      phone: phone?.trim() || null,
      ...(warning ? { warning } : {}),
    }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
