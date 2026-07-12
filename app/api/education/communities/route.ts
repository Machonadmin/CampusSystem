import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import type { CommunityInsert } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

function mapDbError(error: { code?: string; message?: string }) {
  if (error.code === '23505') return { status: 409, message: serverT('community_exists_city') }
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference') }
  return { status: 500, message: error.message ?? serverT('db_error') }
}

/**
 * GET /api/education/communities
 * Список общин с опциональными фильтрами.
 *
 * Query:
 *   country      — фильтр по стране
 *   city         — фильтр по городу
 *   search       — ILIKE по name
 *   active_only  — по умолчанию 'true'; передай 'false' для получения всех
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const sb = createServerClient()
    const params = request.nextUrl.searchParams

    let qb = sb.from('communities').select('*').order('country').order('city').order('name')

    const country = params.get('country')
    if (country) qb = qb.eq('country', country)

    const city = params.get('city')
    if (city) qb = qb.eq('city', city)

    const search = params.get('search')?.trim()
    if (search) qb = qb.ilike('name', `%${search}%`)

    const activeOnly = params.get('active_only') !== 'false'
    if (activeOnly) qb = qb.eq('is_active', true)

    const { data, error } = await qb
    if (error) throw error
    return NextResponse.json({ communities: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * POST /api/education/communities
 * Создать новую общину. Право: education.manage_communities.
 * Общины не привязаны к подразделению → проверка без target (scope='all').
 * Идемпотентен: при дубле (UNIQUE name+city+country) возвращает существующую.
 */
export async function POST(request: NextRequest) {
  try {
    await requireEducationPrivilege('manage_communities')
    const body = await request.json() as Partial<CommunityInsert>

    if (!body.name?.trim()) return apiError('name_field_required', 400)
    if (!body.country?.trim()) return apiError('country_required', 400)
    if (!body.city?.trim()) return apiError('city_required', 400)

    const sb = createServerClient()
    const insert: CommunityInsert = {
      name: body.name.trim(),
      name_he: body.name_he?.trim() || null,
      country: body.country.trim(),
      city: body.city.trim(),
      default_contact_name: body.default_contact_name?.trim() || null,
      default_contact_role: body.default_contact_role?.trim() || null,
      default_contact_phone: body.default_contact_phone?.trim() || null,
      default_contact_email: body.default_contact_email?.trim() || null,
      notes: body.notes?.trim() || null,
      is_active: body.is_active ?? true,
    }

    const { data, error } = await sb
      .from('communities')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insert as any)
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await sb
          .from('communities')
          .select('*')
          .eq('name', insert.name)
          .eq('city', insert.city)
          .eq('country', insert.country)
          .maybeSingle()
        if (existing) return NextResponse.json(existing, { status: 200 })
      }
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
