import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { POPULAR_COUNTRIES, ALL_COUNTRIES } from '@/lib/geo'

export async function GET(request: NextRequest) {
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
