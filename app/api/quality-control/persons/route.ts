import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireFeaturePrivilege } from '@/lib/auth/feature-privileges'
import { jsonError } from '@/lib/api/handler'

export async function GET(request: NextRequest) {
  try {
    await requireFeaturePrivilege('quality_control', 'planned', 'can_create')

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
    return jsonError(err)
  }
}
