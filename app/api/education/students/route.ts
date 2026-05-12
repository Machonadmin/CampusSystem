import { NextRequest, NextResponse } from 'next/server'

/**
 * /api/education/students — DEPRECATED.
 * Тонкий прокси на /api/education/journeys со status=student.
 * Будет удалён в Part 2 миграции; пока сохраняем для обратной совместимости UI.
 */

export async function GET(request: NextRequest) {
  const url = new URL('/api/education/journeys', request.url)
  request.nextUrl.searchParams.forEach((v, k) => url.searchParams.append(k, v))
  url.searchParams.set('status', 'student')

  const resp = await fetch(url.toString(), {
    headers: { cookie: request.headers.get('cookie') ?? '' },
  })
  const data = await resp.json().catch(() => ({}))

  if (data && Array.isArray((data as { journeys?: unknown }).journeys)) {
    return NextResponse.json(
      { students: (data as { journeys: unknown[] }).journeys },
      { status: resp.status }
    )
  }
  return NextResponse.json(data, { status: resp.status })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const newBody = { ...(body as Record<string, unknown>), education_status: 'student' }

  const url = new URL('/api/education/journeys', request.url)
  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
    },
    body: JSON.stringify(newBody),
  })
  const data = await resp.json().catch(() => ({}))
  return NextResponse.json(data, { status: resp.status })
}
