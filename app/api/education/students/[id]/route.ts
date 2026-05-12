import { NextRequest, NextResponse } from 'next/server'

/**
 * /api/education/students/[id] — DEPRECATED.
 * Тонкий прокси на /api/education/journeys/[id].
 * Будет удалён в Part 2 миграции.
 *
 * NB: [id] здесь — теперь это journey_id, не student_id. UI, который хранил
 * student_id из старой таблицы students, в Part 2 необходимо перевести на journey_id.
 */

function buildTarget(request: NextRequest, id: string): string {
  const url = new URL(`/api/education/journeys/${id}`, request.url)
  return url.toString()
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const resp = await fetch(buildTarget(request, params.id), {
    headers: { cookie: request.headers.get('cookie') ?? '' },
  })
  const data = await resp.json().catch(() => ({}))
  return NextResponse.json(data, { status: resp.status })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.text()
  const resp = await fetch(buildTarget(request, params.id), {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      cookie: request.headers.get('cookie') ?? '',
    },
    body,
  })
  const data = await resp.json().catch(() => ({}))
  return NextResponse.json(data, { status: resp.status })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const resp = await fetch(buildTarget(request, params.id), {
    method: 'DELETE',
    headers: { cookie: request.headers.get('cookie') ?? '' },
  })
  const data = await resp.json().catch(() => ({}))
  return NextResponse.json(data, { status: resp.status })
}
