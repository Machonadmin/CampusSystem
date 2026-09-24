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
}

export function clearSession(): void {
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
  }
  cookies().set(AUTH_CONFIG.cookieName, '', opts)
  // Выход во время «צפייה כמשתמש»: сохранённый токен админа (campus_imp_orig,
  // см. /api/auth/impersonate) тоже удаляем — иначе на этом устройстве его можно
  // было бы восстановить через публичный stop-impersonate без пароля.
  cookies().set('campus_imp_orig', '', opts)
}
