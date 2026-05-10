import { NextRequest, NextResponse } from 'next/server'
import { POPULAR_COUNTRIES, ALL_COUNTRIES, CITIES_BY_COUNTRY } from '@/lib/geo'

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country')

  if (country) {
    const cities = CITIES_BY_COUNTRY[country] ?? []
    return NextResponse.json({ cities })
  }

  return NextResponse.json({
    popular: POPULAR_COUNTRIES,
    all: ALL_COUNTRIES,
  })
}
