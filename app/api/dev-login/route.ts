import { NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { signToken } from '@/lib/auth/jwt'
import { AUTH_CONFIG } from '@/lib/auth/config'

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return apiError('not_available', 403)
  }

  const token = await signToken({
    person_id: '00000000-0000-0000-0000-000000000001',
    login_email: 'dev@localhost',
    full_name: 'Dev Admin',
    roles: ['superadmin'],
  })

  const response = NextResponse.redirect(new URL('http://localhost:3000/dashboard'))
  response.cookies.set(AUTH_CONFIG.cookieName, token, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: AUTH_CONFIG.cookieMaxAge,
    path: '/',
  })
  return response
}
