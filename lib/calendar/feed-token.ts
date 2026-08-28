import { SignJWT, jwtVerify } from 'jose'
import { getJwtSecret } from '@/lib/auth/config'

/**
 * Токен подписки на календарь (iCal feed). Встраивается в публичный URL, который
 * пользователь добавляет в Google Calendar. По нему сервер отдаёт .ics именно
 * этого пользователя.
 *
 * БЕЗОПАСНОСТЬ: подписывается ПРОИЗВОДНЫМ ключом (не базовым секретом сессии),
 * поэтому фид-токен НЕВОЗМОЖНО использовать как cookie сессии — getSession/
 * verifyToken проверяют базовым секретом и отвергнут его. И наоборот: сессионный
 * токен не пройдёт verifyFeedToken (другой ключ + обязательный purpose).
 * Ревокация пока не поддержана (нужна БД-версия токена) — TTL 365 дней.
 */

const FEED_TTL = '365d'

function feedSecret(): Uint8Array {
  return new TextEncoder().encode(`${getJwtSecret()}::calendar-feed-v1`)
}

export async function signFeedToken(personId: string): Promise<string> {
  return new SignJWT({ purpose: 'calendar-feed', person_id: personId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(FEED_TTL)
    .sign(feedSecret())
}

/** Возвращает person_id при валидном фид-токене, иначе null. */
export async function verifyFeedToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, feedSecret())
    if (payload.purpose !== 'calendar-feed') return null
    const pid = payload.person_id
    return typeof pid === 'string' && pid.length > 0 ? pid : null
  } catch {
    return null
  }
}
