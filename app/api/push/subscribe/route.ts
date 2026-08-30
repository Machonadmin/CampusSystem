import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api/handler'
import { serverT } from '@/lib/i18n/api-errors'
import { addSubscription, removeSubscription } from '@/lib/push/webpush'

/**
 * POST /api/push/subscribe — сохранить push-подписку ТЕКУЩЕГО пользователя
 * (self-scoped: person_id из сессии, не из body).
 * DELETE /api/push/subscribe — удалить подписку устройства (body: {endpoint}).
 */

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await request.json().catch(() => ({})) as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
    }
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json({ error: serverT('generic_error') }, { status: 400 })
    }
    await addSubscription(session.person_id, {
      endpoint: body.endpoint,
      keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    })
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth()
    const body = await request.json().catch(() => ({})) as { endpoint?: string }
    if (!body.endpoint) return NextResponse.json({ error: serverT('generic_error') }, { status: 400 })
    await removeSubscription(session.person_id, body.endpoint)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
