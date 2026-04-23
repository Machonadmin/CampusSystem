export const AUTH_CONFIG = {
  jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production-min-32-chars!!',
  cookieName: 'campus_session',
  cookieMaxAge: 60 * 60 * 24 * 7, // 7 days
  jwtExpiresIn: '7d',
} as const
