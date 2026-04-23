import { SignJWT, jwtVerify, type JWTPayload as JosePayload } from 'jose'
import { AUTH_CONFIG } from './config'

export interface SessionPayload extends JosePayload {
  person_id: string
  login_email: string
  roles: string[]
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(AUTH_CONFIG.jwtSecret)
}

export async function signToken(payload: Omit<SessionPayload, keyof JosePayload>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(AUTH_CONFIG.jwtExpiresIn)
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as SessionPayload
  } catch {
    return null
  }
}
