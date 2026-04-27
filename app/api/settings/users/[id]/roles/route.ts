import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
  return session
}

// GET /api/settings/users/[id]/roles  — id = account id, pass person_id as query param
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await guard()
    const sb = createServerClient()
    const personId = request.nextUrl.searchParams.get('person_id') ?? params.id

    const { data, error } = await sb.from('person_roles')
      .select('role_id, roles(id, name, code)')
      .eq('person_id', personId)
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

// PUT /api/settings/users/[id]/roles — replace all roles
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await guard()
    const sb = createServerClient()
    const { person_id, role_ids } = await request.json() as { person_id: string; role_ids: string[] }

    await sb.from('person_roles').delete().eq('person_id', person_id)

    if (role_ids.length > 0) {
      const { error } = await sb.from('person_roles').insert(
        role_ids.map(role_id => ({ person_id, role_id, assigned_by: session.person_id }))
      )
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
