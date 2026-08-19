import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { getSignatureMethod, setAppSetting, isSignatureMethod } from '@/lib/settings/app-settings'

/**
 * GET  /api/settings/signature — текущий метод подписи (любой авторизованный).
 * PUT  /api/settings/signature — задать метод (только superadmin).
 *   body: { method: 'typed' | 'drawn' | 'both' }
 */

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const method = await getSignatureMethod()
    return NextResponse.json({ method })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)

    const body = await request.json() as { method?: unknown }
    if (!isSignatureMethod(body.method)) return apiError('invalid_signature_method', 400)

    await setAppSetting('signature_method', body.method, session.person_id)
    return NextResponse.json({ method: body.method })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
