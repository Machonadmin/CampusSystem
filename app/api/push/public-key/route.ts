import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api/handler'
import { serverT } from '@/lib/i18n/api-errors'
import { getVapidKeys } from '@/lib/push/webpush'

/**
 * GET /api/push/public-key — публичный VAPID-ключ для подписки браузера на
 * пуши (pushManager.subscribe). Только для залогиненных (requireAuth).
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireAuth()
    const vapid = await getVapidKeys()
    if (!vapid) return NextResponse.json({ error: serverT('generic_error') }, { status: 500 })
    return NextResponse.json({ key: vapid.publicKey })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
