import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth/jwt'
import { AUTH_CONFIG } from '@/lib/auth/config'
import { errorResponse } from '@/lib/api/handler'

const ORIG_COOKIE = AUTH_CONFIG.impOrigCookieName

/**
 * POST /api/auth/stop-impersonate — вернуться из «צפייה כמשתמש» в свой аккаунт.
 * Восстанавливает админский токен из campus_imp_orig и удаляет её. Публичный
 * префикс (/api/auth/), поэтому доступен даже в режиме read-only.
 *
 * Восстанавливаем ТОЛЬКО если текущая сессия — действительно просмотр (imp_by)
 * и отложенный токен принадлежит тому, кто смотрит (person_id === imp_by).
 * Иначе любой, у кого в браузере осталась старая campus_imp_orig (в том числе
 * вообще без входа), получал бы сессию superadmin'а.
 */
export async function POST() {
  try {
    const cookieStore = await cookies()
    const orig = cookieStore.get(ORIG_COOKIE)?.value
    const currentToken = cookieStore.get(AUTH_CONFIG.cookieName)?.value
    const current = currentToken ? await verifyToken(currentToken) : null
    const origSession = orig ? await verifyToken(orig) : null

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    }

    if (orig && origSession && current?.imp_by && origSession.person_id === current.imp_by) {
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
    return errorResponse(e)
  }
}
