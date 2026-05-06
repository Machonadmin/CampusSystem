import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const q = request.nextUrl.searchParams.get('q') ?? ''
    if (q.length < 2) return NextResponse.json([])

    const sb = createServerClient()
    const { data } = await sb
      .from('persons')
      .select('id, full_name')
      .ilike('full_name', `%${q}%`)
      .limit(10)

    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
