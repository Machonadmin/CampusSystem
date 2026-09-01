import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { serverT } from '@/lib/i18n/api-errors'
import { verifyToken } from '@/lib/auth/jwt'
import { AUTH_CONFIG } from '@/lib/auth/config'

const ORIG_COOKIE = 'campus_imp_orig'

/**
 * POST /api/auth/stop-impersonate — вернуться из «צפייה כמשתמש» в свой аккаунт.
 * Восстанавливает админский токен из campus_imp_orig и удаляет её. Публичный
 * префикс (/api/auth/), поэтому доступен даже в режиме read-only.
 */
export async function POST() {
  try {
    const cookieStore = cookies()
    const orig = cookieStore.get(ORIG_COOKIE)?.value

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    }

    if (orig && (await verifyToken(orig))) {
      cookieStore.set(AUTH_CONFIG.cookieName, orig, { ...cookieOpts, maxAge: AUTH_CONFIG.cookieMaxAge })
      cookieStore.set(ORIG_COOKIE, '', { ...cookieOpts, maxAge: 0 })
      return NextResponse.json({ ok: true })
    }

    // Нечего восстанавливать (кука истекла/повреждена) — чистим обе, чтобы не
    // застрять в режиме просмотра; клиент отправит на /login.
    cookieStore.set(ORIG_COOKIE, '', { ...cookieOpts, maxAge: 0 })
    cookieStore.set(AUTH_CONFIG.cookieName, '', { ...cookieOpts, maxAge: 0 })
    return NextResponse.json({ ok: true, relogin: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
