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
  cookies().set(AUTH_CONFIG.cookieName, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}
