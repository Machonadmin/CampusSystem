import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'

/** Создание аудитории в здании. Деплой-безопасно (нет таблицы → 503). */
function u(sb: ReturnType<typeof createServerClient>): SupabaseClient {
  return sb as unknown as SupabaseClient
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_class_groups')
    if (!allowed) return apiError('forbidden', 403)

    const body = await request.json() as { name?: string; capacity?: number | null }
    const name = body.name?.trim()
    if (!name) return apiError('title_required', 400)

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (u(sb).from('rooms').insert({
      building_id: params.id, name, capacity: body.capacity ?? null,
    } as any).select('id').single() as any)
    if (error) {
      if (error.code === '42P01') return apiError('feature_not_migrated', 503)
      if (error.code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
