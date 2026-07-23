import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { sanitizeOrSearch } from '@/lib/search/sanitize'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
}

export async function GET(request: NextRequest) {
  try {
    await guard()
    const q = sanitizeOrSearch(request.nextUrl.searchParams.get('q'))
    if (q.length < 2) return NextResponse.json([])

    const sb = createServerClient()
    const { data } = await sb
      .from('persons')
      .select('id, full_name, email')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(10)

    return NextResponse.json(data ?? [])
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
