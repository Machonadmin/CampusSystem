import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const q = request.nextUrl.searchParams.get('q') ?? ''
    const sb = createServerClient()

    let qb = sb.from('persons').select('id, full_name, email').order('full_name').limit(15)
    if (q.length >= 2) qb = qb.ilike('full_name', `%${q}%`)

    const { data } = await qb
    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const body = await request.json()
    const { full_name, email, phone } = body as { full_name?: string; email?: string; phone?: string }

    if (!full_name?.trim()) {
      return NextResponse.json({ error: 'Имя обязательно' }, { status: 400 })
    }

    const sb = createServerClient()
    const phones = phone?.trim() ? [{ type: 'mobile', number: phone.trim() }] : []

    const { data, error } = await sb
      .from('persons')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ full_name: full_name.trim(), email: email?.trim() || null, phones } as any)
      .select('id, full_name, email')
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
