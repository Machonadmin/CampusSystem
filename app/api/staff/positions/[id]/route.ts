import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function guard() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await guard()
    const sb = createServerClient()
    const body = await request.json() as { position_ru?: string; employment_type?: string; is_head?: boolean; end_date?: string | null }

    const update: Record<string, unknown> = {}
    if (body.position_ru !== undefined) update.position_ru = body.position_ru
    if (body.employment_type !== undefined) update.employment_type = body.employment_type
    if (body.is_head !== undefined) update.is_head = body.is_head
    if (body.end_date !== undefined) update.end_date = body.end_date

    const { error } = await sb.from('staff_positions').update(update).eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
