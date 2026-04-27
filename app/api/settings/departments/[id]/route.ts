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
    const sb = createServerClient()
    const body = await request.json()
    const { error } = await sb.from('departments').update(body).eq('id', params.id)
    if (error) throw error
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

    // Re-parent children to this dept's parent before deleting
    const { data: dept } = await sb.from('departments').select('parent_id').eq('id', params.id).single()
    await sb.from('departments').update({ parent_id: dept?.parent_id ?? null }).eq('parent_id', params.id)

    const { error } = await sb.from('departments').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
