import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
}

async function requireSuperadmin() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const country = request.nextUrl.searchParams.get('country')
    const sb = createServerClient()

    let qb = sb.from('reference_cities').select('id, country, city').order('city')
    if (country) qb = qb.eq('country', country)

    const { data, error } = await qb
    if (error) throw error
    return NextResponse.json({ cities: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperadmin()
    const body = await request.json() as { country?: string; city?: string }
    const country = body.country?.trim()
    const city = body.city?.trim()

    if (!country || !city) {
      return apiError('country_city_required', 400)
    }

    const sb = createServerClient()
    const { data, error } = await sb
      .from('reference_cities')
      .insert({ country, city })
      .select('id, country, city')
      .single()

    if (error) {
      if (error.code === '23505') {
        return apiError('city_exists', 409)
      }
      throw error
    }
    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
