import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await guard()
    const body = await request.json() as { city?: string }
    const city = body.city?.trim()
    if (!city) return NextResponse.json({ error: 'Название города обязательно' }, { status: 400 })

    const sb = createServerClient()
    const { error } = await sb
      .from('reference_cities')
      .update({ city })
      .eq('id', params.id)

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Такой город уже есть' }, { status: 409 })
      }
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await guard()
    const sb = createServerClient()
    const { error } = await sb.from('reference_cities').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
