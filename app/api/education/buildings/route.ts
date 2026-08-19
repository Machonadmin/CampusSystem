import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'

/**
 * Здания и аудитории кампуса (для расписания: здание + аудитория вместо
 * свободного текста). Деплой-безопасно: если таблиц ещё нет (миграция
 * studies_drilldown не применена) — GET отдаёт пустой список, POST — 503.
 */
function u(sb: ReturnType<typeof createServerClient>): SupabaseClient {
  return sb as unknown as SupabaseClient
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: buildings, error } = await (u(sb)
      .from('buildings').select('id, name, code, is_active').order('sort_order').order('name') as any)
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ buildings: [] })
      throw error
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bRows = (buildings ?? []) as any[]
    if (bRows.length === 0) return NextResponse.json({ buildings: [] })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rooms } = await (u(sb)
      .from('rooms').select('id, building_id, name, capacity, is_active').order('sort_order').order('name') as any)
    const byBuilding = new Map<string, unknown[]>()
    for (const r of (rooms ?? []) as Array<{ building_id: string }>) {
      const arr = byBuilding.get(r.building_id) ?? []
      arr.push(r); byBuilding.set(r.building_id, arr)
    }
    const result = bRows.map(b => ({ id: b.id, name: b.name, code: b.code ?? null, is_active: b.is_active ?? true, rooms: byBuilding.get(b.id) ?? [] }))
    return NextResponse.json({ buildings: result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code === '42P01') return NextResponse.json({ buildings: [] })
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_class_groups')
    if (!allowed) return apiError('forbidden', 403)

    const body = await request.json() as { name?: string; code?: string | null }
    const name = body.name?.trim()
    if (!name) return apiError('title_required', 400)

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (u(sb).from('buildings').insert({ name, code: body.code?.trim() || null } as any).select('id').single() as any)
    if (error) {
      if (error.code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
