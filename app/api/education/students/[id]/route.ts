import { NextRequest, NextResponse } from 'next/server'
import {
  GET as journeyGET,
  PATCH as journeyPATCH,
  DELETE as journeyDELETE,
} from '@/app/api/education/journeys/[id]/route'

/**
 * /api/education/students/[id] — DEPRECATED.
 * Тонкий прокси на /api/education/journeys/[id].
 * Будет удалён в Part 2 миграции.
 *
 * NB: [id] здесь — теперь это journey_id, не student_id. UI, который хранил
 * student_id из старой таблицы students, в Part 2 необходимо перевести на journey_id.
 *
 * ВАЖНО: раньше прокси делал fetch() на URL из request.url (Host-заголовок, под
 * контролем клиента) с пробросом cookie сессии — SSRF/утечка куки. Теперь
 * вызываем обработчик /journeys/[id] напрямую в процессе; сессия берётся из
 * next/headers, исходящего запроса нет, Host не используется. Базовый origin —
 * только заглушка для конструктора URL (обработчик host не читает).
 */

const INTERNAL_BASE = 'http://internal.invalid'

function proxied(id: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(new URL(`/api/education/journeys/${id}`, INTERNAL_BASE), init)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const resp = await journeyGET(proxied(params.id), { params })
  const data = await resp.json().catch(() => ({}))
  return NextResponse.json(data, { status: resp.status })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.text()
  const resp = await journeyPATCH(
    proxied(params.id, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body }),
    { params },
  )
  const data = await resp.json().catch(() => ({}))
  return NextResponse.json(data, { status: resp.status })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const resp = await journeyDELETE(proxied(params.id, { method: 'DELETE' }), { params })
  const data = await resp.json().catch(() => ({}))
  return NextResponse.json(data, { status: resp.status })
}
