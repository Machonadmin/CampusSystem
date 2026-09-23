import { cookies } from 'next/headers'
import { AUTH_CONFIG } from './config'
import { signToken, verifyToken, type SessionPayload } from './jwt'
import { checkLiveSession } from './live-session'

/**
 * Текущая сессия: подпись и срок токена + живая сверка с базой (аккаунт
 * активен, пароль с тех пор не меняли; роли — текущие). См. live-session.ts.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = cookies()
  const token = cookieStore.get(AUTH_CONFIG.cookieName)?.value
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return checkLiveSession(payload)
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

/**
 * Выписать текущему пользователю новый токен с теми же данными. Нужен после
 * revokeSessionsBefore (смена пароля): остальные устройства выходят, а браузер,
 * в котором пароль сменили, остаётся в системе.
 */
export async function reissueSession(session: SessionPayload): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { iat, exp, nbf, jti, aud, iss, sub, ...payload } = session
  await createSession(payload)
}
