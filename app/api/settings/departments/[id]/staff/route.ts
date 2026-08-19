import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { EmploymentType } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
}

async function requireSuperadmin() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth()
    const sb = createServerClient()

    const { data: positions } = await sb
      .from('staff_positions')
      .select('id, person_id, position_ru, is_head, start_date')
      .eq('department_id', params.id)
      .is('end_date', null)
      .order('is_head', { ascending: false })

    if (!positions || positions.length === 0) return NextResponse.json([])

    const personIds = positions.map(p => p.person_id)
    const [{ data: persons }, { data: profiles }] = await Promise.all([
      sb.from('persons').select('id, full_name, photo_url').in('id', personIds),
      sb.from('staff_profiles').select('person_id, employment_type').in('person_id', personIds),
    ])

    const result = positions.map(pos => ({
      ...pos,
      full_name: persons?.find(p => p.id === pos.person_id)?.full_name ?? '',
      photo_url: persons?.find(p => p.id === pos.person_id)?.photo_url ?? null,
      employment_type: profiles?.find(p => p.person_id === pos.person_id)?.employment_type ?? null,
    }))

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()

    const body = await request.json() as {
      person_id?: string
      last_name?: string | null
      first_name?: string
      middle_name?: string | null
      full_name?: string   // legacy fallback → first_name
      email?: string
      position_ru: string
      employment_type: string
    }

    if (!body.position_ru)
      return apiError('position_required', 400)

    let person_id = body.person_id

    if (!person_id) {
      const deptFirstName = body.first_name?.trim() || body.full_name?.trim() || ''
      if (!deptFirstName) return apiError('name_required', 400)
      const deptLastName   = body.first_name?.trim() ? (body.last_name?.trim() || null) : null
      const deptMiddleName = body.first_name?.trim() ? (body.middle_name?.trim() || null) : null
      const { data: person, error: ep } = await sb.from('persons').insert({
        last_name: deptLastName,
        first_name: deptFirstName,
        middle_name: deptMiddleName,
        hebrew_name: null, gender: null, birth_date: null,
        photo_url: null, email: body.email ?? null, phones: [], address: {}, notes: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).select('id').single()
      if (ep) throw ep
      person_id = person.id
    }

    // Create staff_profile if not exists
    const { error: eprof } = await sb.from('staff_profiles').insert({
      person_id,
      employment_type: (body.employment_type as EmploymentType) ?? 'staff',
      hire_date: new Date().toISOString().split('T')[0],
      fire_date: null, notes: null,
    })
    if (eprof && (eprof as { code?: string }).code !== '23505') throw eprof

    const { error: epos } = await sb.from('staff_positions').insert({
      person_id,
      department_id: params.id,
      position_ru: body.position_ru,
      position_he: null,
      position_id: null,
      is_head: false,
      start_date: new Date().toISOString().split('T')[0],
      end_date: null,
    })
    if (epos) throw epos

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
