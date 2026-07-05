import { NextRequest, NextResponse } from 'next/server'

/**
 * /api/education/students — DEPRECATED.
 * Тонкий прокси на /api/education/journeys со status=student.
 * Будет удалён в Part 2 миграции; пока сохраняем для обратной совместимости UI.
 */

/** Полный набор статусов учебного цикла (для эндпоинта «студенты»). */
const STUDENT_LIFECYCLE = ['student', 'on_leave', 'graduated', 'expelled']

export async function GET(request: NextRequest) {
  const url = new URL('/api/education/journeys', request.url)
  request.nextUrl.searchParams.forEach((v, k) => {
    if (k === 'status') return // status обрабатываем отдельно ниже
    url.searchParams.append(k, v)
  })

  // Ограничиваем статус подмножеством учебного цикла: что бы ни запросил
  // клиент, эндпоинт «студенты» не отдаёт лидов/абитуриентов.
  const requested = (request.nextUrl.searchParams.get('status') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
  const allowed = requested.filter(s => STUDENT_LIFECYCLE.includes(s))
  url.searchParams.set('status', (allowed.length > 0 ? allowed : STUDENT_LIFECYCLE).join(','))

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
