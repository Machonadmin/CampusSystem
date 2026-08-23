import { NextRequest, NextResponse } from 'next/server'
import { GET as journeysGET, POST as journeysPOST } from '@/app/api/education/journeys/route'

/**
 * /api/education/students — DEPRECATED.
 * Тонкий прокси на /api/education/journeys со status=student.
 * Будет удалён в Part 2 миграции; пока сохраняем для обратной совместимости UI.
 *
 * ВАЖНО: раньше прокси делал fetch() на URL, построенный из request.url (то есть
 * из заголовка Host, которым управляет клиент), и пробрасывал cookie сессии —
 * это давало SSRF/утечку куки на произвольный origin. Теперь вызываем обработчик
 * /journeys напрямую в том же процессе: сессия резолвится из next/headers
 * (ambient cookies), никакого исходящего запроса и никакого доверия к Host нет.
 * Базовый origin ('http://internal.invalid') используется ТОЛЬКО как заглушка для
 * конструктора URL — обработчик читает лишь searchParams, host не используется.
 */

const INTERNAL_BASE = 'http://internal.invalid'

/** Полный набор статусов учебного цикла (для эндпоинта «студенты»). */
const STUDENT_LIFECYCLE = ['student', 'on_leave', 'graduated', 'expelled']

export async function GET(request: NextRequest) {
  const url = new URL('/api/education/journeys', INTERNAL_BASE)
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

  const resp = await journeysGET(new NextRequest(url))
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

  const proxied = new NextRequest(new URL('/api/education/journeys', INTERNAL_BASE), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(newBody),
  })
  const resp = await journeysPOST(proxied)
  const data = await resp.json().catch(() => ({}))
  return NextResponse.json(data, { status: resp.status })
}
