import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { signFeedToken } from '@/lib/calendar/feed-token'

/**
 * GET /api/calendar/feed-link — вернуть персональный URL iCal-подписки текущего
 * пользователя (для «חבר ליומן גוגל»). Токен подписывается на лету производным
 * ключом (см. lib/calendar/feed-token.ts) — сам по себе он бесполезен как сессия.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const token = await signFeedToken(session.person_id)
    const proto = request.headers.get('x-forwarded-proto') ?? 'https'
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? request.nextUrl.host
    const url = `${proto}://${host}/api/public/calendar-feed?token=${token}`
    return NextResponse.json({ url })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
