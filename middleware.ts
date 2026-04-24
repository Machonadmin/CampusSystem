import { NextRequest, NextResponse } from 'next/server'
import { AUTH_CONFIG } from '@/lib/auth/config'
import { verifyToken } from '@/lib/auth/jwt'

// Routes that are always public
const PUBLIC_API_PREFIXES = ['/api/auth/']
const PUBLIC_PAGES = ['/login']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public API auth routes
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Allow public pages
  if (PUBLIC_PAGES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = request.cookies.get(AUTH_CONFIG.cookieName)?.value

  // Root path: redirect based on auth status
  if (pathname === '/') {
    if (token && await verifyToken(token)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // No token — redirect pages to /login, reject API calls with 401
  if (!token) {
    return unauthorized(request)
  }

  const session = await verifyToken(token)

  if (!session) {
    return unauthorized(request)
  }

  // Attach person_id header for downstream use
  const response = NextResponse.next()
  response.headers.set('x-person-id', session.person_id)
  return response
}

function unauthorized(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('from', request.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/api/:path*',
  ],
}
