import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hashPassword } from '@/lib/auth/password'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
  return session
}

export async function GET() {
  try {
    await guard()
    const sb = createServerClient()

    const { data: accounts, error: e1 } = await sb
      .from('person_accounts')
      .select('id, person_id, login_email, is_active, last_login, created_at')
      .order('created_at', { ascending: false })
    if (e1) throw e1

    const personIds = [...new Set((accounts ?? []).map(a => a.person_id))]
    if (personIds.length === 0) return NextResponse.json([])

    const [{ data: persons }, { data: prRows }] = await Promise.all([
      sb.from('persons').select('id, full_name, photo_url').in('id', personIds),
      sb.from('person_roles').select('person_id, role_id').in('person_id', personIds),
    ])

    const roleIds = [...new Set((prRows ?? []).map(r => r.role_id))]
    const { data: roles } = roleIds.length
      ? await sb.from('roles').select('id, name, code').in('id', roleIds)
      : { data: [] as { id: string; name: string; code: string }[] }

    const result = (accounts ?? []).map(acc => {
      const person = persons?.find(p => p.id === acc.person_id)
      const userRoleIds = (prRows ?? []).filter(r => r.person_id === acc.person_id).map(r => r.role_id)
      const userRoles = (roles ?? []).filter(r => userRoleIds.includes(r.id))
      return {
        account_id: acc.id,
        person_id: acc.person_id,
        login_email: acc.login_email,
        is_active: acc.is_active,
        last_login: acc.last_login,
        created_at: acc.created_at,
        full_name: person?.full_name ?? '',
        photo_url: person?.photo_url ?? null,
        roles: userRoles,
      }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await guard()
    const sb = createServerClient()
    const { full_name, person_id, login_email, password, role_ids = [] } = await request.json() as {
      full_name?: string
      person_id?: string
      login_email: string
      password: string
      role_ids?: string[]
    }

    if (!login_email || !password)
      return NextResponse.json({ error: 'Email и пароль обязательны' }, { status: 400 })
    if (password.length < 8)
      return NextResponse.json({ error: 'Пароль минимум 8 символов' }, { status: 400 })

    const password_hash = await hashPassword(password)

    let final_person_id = person_id

    if (!final_person_id) {
      if (!full_name) return NextResponse.json({ error: 'Имя обязательно' }, { status: 400 })
      const { data: person, error: e1 } = await sb.from('persons').insert({
        full_name, hebrew_name: null, gender: null, birth_date: null,
        photo_url: null, email: null, phones: [], address: {}, notes: null,
      }).select('id').single()
      if (e1) throw e1
      final_person_id = person.id
    }

    const { data: account, error: e2 } = await sb.from('person_accounts')
      .insert({ person_id: final_person_id, login_email: login_email.toLowerCase().trim(), password_hash, is_active: true, last_login: null })
      .select('id').single()
    if (e2) throw e2

    if (role_ids.length > 0) {
      const { error: e3 } = await sb.from('person_roles').insert(
        role_ids.map(role_id => ({ person_id: final_person_id!, role_id, assigned_by: session.person_id }))
      )
      if (e3) throw e3
    }

    return NextResponse.json({ person_id: final_person_id, account_id: account.id }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '23505') return NextResponse.json({ error: 'Email уже используется' }, { status: 409 })
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
