import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const sb = createServerClient()
    const { data, error } = await sb
      .from('persons')
      .select('id, full_name, email, phones')
      .eq('id', params.id)
      .single()

    if (error) throw error

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = data as any
    return NextResponse.json({
      id: p.id,
      full_name: p.full_name,
      email: p.email ?? null,
      phone: Array.isArray(p.phones) && p.phones.length > 0 ? (p.phones[0]?.number ?? null) : null,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
