import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hashPassword } from '@/lib/auth/password'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await guard()
    const sb = createServerClient()
    const { password } = await request.json() as { password: string }

    if (!password || password.length < 8)
      return NextResponse.json({ error: 'Пароль должен быть не менее 8 символов' }, { status: 400 })

    const password_hash = await hashPassword(password)
    const { error } = await sb.from('person_accounts')
      .update({ password_hash })
      .eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
