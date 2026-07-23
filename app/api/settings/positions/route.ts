import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { PositionCategory, ReferencePositionInsert } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

function isAdmin(session: Awaited<ReturnType<typeof requireAuth>>) {
  const roles = session.roles ?? []
  return roles.includes('superadmin') || roles.includes('admin') || roles.includes('hr_director')
}

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '23505') return { status: 409, message: serverT('position_exists') }
  return { status: 500, message: error.message ?? serverT('db_error') }
}

const VALID_CATEGORIES: PositionCategory[] = ['academic', 'administrative', 'support']

/**
 * GET /api/settings/positions
 * Query: category, is_teaching=true|false, active_only (default true)
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const sb = createServerClient()
    const params = request.nextUrl.searchParams

    let qb = sb
      .from('reference_positions')
      .select('*')
      .order('sort_order')
      .order('name_ru')

    const category = params.get('category') as PositionCategory | null
    if (category && VALID_CATEGORIES.includes(category)) qb = qb.eq('category', category)

    const isTeaching = params.get('is_teaching')
    if (isTeaching === 'true') qb = qb.eq('is_teaching', true)
    else if (isTeaching === 'false') qb = qb.eq('is_teaching', false)

    const activeOnly = params.get('active_only') !== 'false'
    if (activeOnly) qb = qb.eq('is_active', true)

    const { data, error } = await qb
    if (error) throw error

    return NextResponse.json({ positions: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * POST /api/settings/positions
 * Право: superadmin / admin / hr_director
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    if (!isAdmin(session)) {
      return apiError('forbidden', 403)
    }

    const sb = createServerClient()
    const body = await request.json() as {
      name_ru?: string
      name_he?: string | null
      category?: string
      is_teaching?: boolean
      sort_order?: number
    }

    const name_ru = body.name_ru?.trim()
    if (!name_ru) return apiError('title_required', 400)
    if (!body.category || !VALID_CATEGORIES.includes(body.category as PositionCategory)) {
      return apiError('category_enum', 400)
    }

    const insert: ReferencePositionInsert = {
      name_ru,
      name_he: body.name_he?.trim() || null,
      category: body.category as PositionCategory,
      is_teaching: body.is_teaching ?? false,
      is_active: true,
      sort_order: body.sort_order ?? 100,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb.from('reference_positions').insert(insert as any).select('*').single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
