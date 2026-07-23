import { SignJWT, jwtVerify, type JWTPayload as JosePayload } from 'jose'
import { AUTH_CONFIG, getJwtSecret } from './config'

export interface SessionPayload extends JosePayload {
  person_id: string
  login_email: string
  full_name: string | null
  roles: string[]
  // Тип принципала. Отсутствие поля ⇒ считаем 'staff' (обратная совместимость
  // со старыми токенами). Студентка ВСЕГДА получает principal:'student' и
  // student_journey_id, а roles:[] — она никогда не имеет ролей сотрудника.
  principal?: 'staff' | 'student'
  student_journey_id?: string
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret())
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
