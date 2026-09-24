import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { POPULAR_COUNTRIES, ALL_COUNTRIES } from '@/lib/geo'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) return apiError('unauthorized', 401)

  const country = request.nextUrl.searchParams.get('country')

  if (country) {
    const sb = createServerClient()
    const { data } = await sb
      .from('reference_cities')
      .select('city')
      .eq('country', country)
      .order('city')
    return NextResponse.json({ cities: data?.map(r => r.city) ?? [] })
  }

  return NextResponse.json({
    popular: POPULAR_COUNTRIES,
    all: ALL_COUNTRIES,
  })
}
