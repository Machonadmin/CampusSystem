import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
}

export async function GET() {
  try {
    await guard()
    const sb = createServerClient()

    const [{ data: depts }, { data: staffPos }] = await Promise.all([
      sb.from('departments').select('id, name, parent_id, head_person_id, sort_order, description, created_at').order('sort_order').order('name'),
      sb.from('staff_positions').select('department_id').is('end_date', null),
    ])

    const headIds = [...new Set((depts ?? []).filter(d => d.head_person_id).map(d => d.head_person_id!))]
    const { data: headPersons } = headIds.length
      ? await sb.from('persons').select('id, full_name').in('id', headIds)
      : { data: [] as { id: string; full_name: string }[] }

    const countByDept: Record<string, number> = {}
    for (const sp of staffPos ?? []) {
      countByDept[sp.department_id] = (countByDept[sp.department_id] ?? 0) + 1
    }

    const result = (depts ?? []).map(d => ({
      ...d,
      head_name: headPersons?.find(p => p.id === d.head_person_id)?.full_name ?? null,
      employee_count: countByDept[d.id] ?? 0,
    }))

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await guard()
    const sb = createServerClient()
    const body = await request.json() as { name: string; parent_id?: string | null; sort_order?: number; description?: string | null }

    if (!body.name) return NextResponse.json({ error: 'Название обязательно' }, { status: 400 })

    const { data, error } = await sb.from('departments')
      .insert({ name: body.name, parent_id: body.parent_id ?? null, head_person_id: null, sort_order: body.sort_order ?? 0, description: body.description ?? null })
      .select('*').single()
    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
