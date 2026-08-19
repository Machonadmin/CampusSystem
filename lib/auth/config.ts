// Известное небезопасное значение по умолчанию из старого кода. Если JWT_SECRET
// в окружении равен ему — секрет считается НЕустановленным (fail-closed в prod).
const DEFAULT_INSECURE_SECRET = 'change-me-in-production-min-32-chars!!'

export const AUTH_CONFIG = {
  cookieName: 'campus_session',
  cookieMaxAge: 60 * 60 * 24 * 7, // 7 days
  jwtExpiresIn: '7d',
} as const

/**
 * Секрет подписи JWT. Вычисляется ЛЕНИВО (на запросе), а не на импорте —
 * поэтому не ломает сборку, если переменная доступна только в рантайме.
 *
 * QA FIX #1 (Critical): fail-closed. В production бросаем, если JWT_SECRET
 * отсутствует, короче 32 символов или равен известному небезопасному дефолту —
 * чтобы приложение НИКОГДА не подписывало токены угадываемым ключом (иначе
 * можно подделать superadmin). Вне production разрешаем детерминированный
 * дев-фолбэк, чтобы локальная разработка и тесты работали без настройки.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET

  if (!secret || secret.length < 32 || secret === DEFAULT_INSECURE_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'JWT_SECRET is missing, shorter than 32 characters, or set to the insecure ' +
        'default. Set a strong random JWT_SECRET (e.g. `openssl rand -base64 48`) in ' +
        'the environment before starting the app.',
      )
    }
    return DEFAULT_INSECURE_SECRET
  }

  return secret
}
