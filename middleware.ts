import { NextRequest, NextResponse } from 'next/server'
import { AUTH_CONFIG } from '@/lib/auth/config'
import { verifyToken } from '@/lib/auth/jwt'

const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/dev-login', '/api/public/', '/api/portal/login']
const PUBLIC_PAGES = ['/login', '/portal/login']

// Module routes that require an explicit access privilege
const PROTECTED_MODULES = new Set([
  'persons', 'staff', 'applicants', 'education', 'jewishness', 'finance', 'dormitory', 'food',
  'security', 'alumni', 'sponsors', 'documents', 'reports',
  'contacts', 'settings', 'doctor', 'psychologist', 'maintenance',
  'quality_control',
])

async function fetchAccessibleModules(roleCodes: string[]): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || roleCodes.length === 0) return []

  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  // Get role IDs for the user's role codes
  const quotedCodes = roleCodes.map(c => `"${c}"`).join(',')
  const rolesRes = await fetch(
    `${url}/rest/v1/roles?code=in.(${quotedCodes})&select=id`,
    { headers }
  )
  if (!rolesRes.ok) return []
  const roleRows = (await rolesRes.json()) as { id: string }[]
  if (roleRows.length === 0) return []

  // Get modules where privilege_code = 'access'
  const quotedIds = roleRows.map(r => `"${r.id}"`).join(',')
  const privsRes = await fetch(
    `${url}/rest/v1/role_privileges?role_id=in.(${quotedIds})&privilege_code=eq.access&select=module`,
    { headers }
  )
  if (!privsRes.ok) return []
  const privs = (await privsRes.json()) as { module: string }[]
  return [...new Set(privs.map(p => p.module))]
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next()
  if (PUBLIC_PAGES.some(p => pathname.startsWith(p))) return NextResponse.next()

  const token = request.cookies.get(AUTH_CONFIG.cookieName)?.value

  if (pathname === '/') {
    const s = token ? await verifyToken(token) : null
    if (s) {
      // Студентку — в её портал, сотрудника — в дашборд.
      if (s.principal === 'student') return NextResponse.redirect(new URL('/portal', request.url))
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!token) return unauthorized(request)

  const session = await verifyToken(token)
  if (!session) return unauthorized(request)

  // ── Портал студентки (/portal/**; /portal/login публичен и обработан выше) ──
  // Только principal:'student' допускается в /portal. Сотрудников держим ВНЕ
  // портала (→ /dashboard). Это чистая проверка токена, без обращений к БД.
  if (pathname.startsWith('/portal')) {
    if (session.principal !== 'student') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    const response = NextResponse.next()
    response.headers.set('x-person-id', session.person_id)
    return response
  }

  // Студентку держим ВНЕ /dashboard/**, / и прочих staff-страниц → /portal.
  // Только для страниц: её собственные API-вызовы (/api/**) проходят дальше и
  // ограничиваются own-journey проверкой в самих маршрутах.
  if (session.principal === 'student' && !pathname.startsWith('/api/')) {
    return NextResponse.redirect(new URL('/portal', request.url))
  }

  // Module access guard — only for /dashboard/[moduleCode] page routes
  if (pathname.startsWith('/dashboard/')) {
    // Директория страницы использует дефис ('quality-control'), а код модуля в
    // role_privileges — подчёркивание ('quality_control'). Нормализуем, иначе
    // страница не сматчилась бы с PROTECTED_MODULES / accessible.
    const moduleCode = pathname.split('/')[2]?.replace(/-/g, '_') // e.g. 'settings', 'quality_control'

    if (moduleCode && PROTECTED_MODULES.has(moduleCode) && !pathname.startsWith('/api/')) {
      if (!session.roles.includes('superadmin')) {
        const accessible = await fetchAccessibleModules(session.roles)
        if (!accessible.includes(moduleCode)) {
          return NextResponse.redirect(new URL('/dashboard', request.url))
        }
      }
    }
  }

  const response = NextResponse.next()
  response.headers.set('x-person-id', session.person_id)
  return response
}

// Локальная карта перевода для middleware: он выполняется в Edge-runtime, где
// недоступен getCookieLocale() (next/headers), а импорт всех messages/*.json
// раздул бы edge-бандл. Нужна ровно одна строка — 'unauthorized' на 3 языках;
// значения совпадают с неймспейсом errors в messages/*.json.
const UNAUTHORIZED_MSG: Record<string, string> = {
  ru: 'Не авторизован',
  he: 'לא מורשה',
  en: 'Not authorized',
}

function unauthorized(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const loc = request.cookies.get('campus_locale')?.value
    const lang = loc === 'he' || loc === 'en' ? loc : 'ru'
    return NextResponse.json({ error: UNAUTHORIZED_MSG[lang], code: 'unauthorized' }, { status: 401 })
  }
  // Портал студентки → её страница входа; всё остальное → вход сотрудника.
  const loginUrl = new URL(request.nextUrl.pathname.startsWith('/portal') ? '/portal/login' : '/login', request.url)
  loginUrl.searchParams.set('from', request.nextUrl.pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/api/:path*', '/portal/:path*'],
}
