import { cookies } from 'next/headers'
import { AUTH_CONFIG } from './config'
import { signToken, verifyToken, type SessionPayload } from './jwt'

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies()
  const token = cookieStore.get(AUTH_CONFIG.cookieName)?.value
  if (!token) return null
  return verifyToken(token)
}

export async function createSession(payload: Omit<SessionPayload, 'iat' | 'exp'>): Promise<void> {
  const token = await signToken(payload)
  cookies().set(AUTH_CONFIG.cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: AUTH_CONFIG.cookieMaxAge,
    path: '/',
  })
  // Новый вход начинает с чистого листа: отложенный токен superadmin'а от
  // прошлой «צפייה כמשתמש» в этом браузере не должен пережить смену человека.
  clearImpersonationOrigin()
}

export function clearSession(): void {
  cookies().set(AUTH_CONFIG.cookieName, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  // Выход из режима просмотра кнопкой «выйти» раньше оставлял в браузере
  // campus_imp_orig с токеном superadmin'а: следующий человек за этим
  // компьютером мог вызвать stop-impersonate и стать superadmin'ом.
  clearImpersonationOrigin()
}

function clearImpersonationOrigin(): void {
  cookies().set(AUTH_CONFIG.impOrigCookieName, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}
