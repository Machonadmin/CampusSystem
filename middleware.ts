import { NextRequest, NextResponse } from 'next/server'
import { AUTH_CONFIG } from '@/lib/auth/config'
import { verifyToken } from '@/lib/auth/jwt'

const PUBLIC_API_PREFIXES = ['/api/auth/', '/api/dev-login', '/api/public/', '/api/portal/login', '/api/cron/']
const PUBLIC_PAGES = ['/login', '/portal/login']

// Module routes that require an explicit access privilege
const PROTECTED_MODULES = new Set([
  'persons', 'staff', 'applicants', 'education', 'jewishness', 'finance', 'dormitory', 'food',
  'security', 'alumni', 'sponsors', 'documents', 'reports',
  'contacts', 'settings', 'doctor', 'psychologist', 'maintenance',
  'quality_control',
])

async function fetchAccessibleModules(roleCodes: string[], personId: string): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return []

  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const set = new Set<string>()

  // Role-based module access.
  if (roleCodes.length > 0) {
    const quotedCodes = roleCodes.map(c => `"${c}"`).join(',')
    const rolesRes = await fetch(`${url}/rest/v1/roles?code=in.(${quotedCodes})&select=id`, { headers })
    if (rolesRes.ok) {
      const roleRows = (await rolesRes.json()) as { id: string }[]
      if (roleRows.length > 0) {
        const quotedIds = roleRows.map(r => `"${r.id}"`).join(',')
        const privsRes = await fetch(
          `${url}/rest/v1/role_privileges?role_id=in.(${quotedIds})&privilege_code=eq.access&select=module`,
          { headers },
        )
        if (privsRes.ok) {
          for (const p of (await privsRes.json()) as { module: string }[]) set.add(p.module)
        }
      }
    }
  }

  // Персональные оверрайды доступа к модулю (grant/deny) поверх ролей — как в
  // /api/auth/me. Устойчиво к отсутствию таблицы (просто нет оверрайдов).
  try {
    const pRes = await fetch(
      `${url}/rest/v1/person_privileges?person_id=eq.${personId}&privilege_code=eq.access&select=module,is_granted,expires_at`,
      { headers },
    )
    if (pRes.ok) {
      const now = Date.now()
      for (const r of (await pRes.json()) as { module: string; is_granted: boolean; expires_at: string | null }[]) {
        if (r.expires_at && new Date(r.expires_at).getTime() <= now) continue
        if (r.is_granted) set.add(r.module); else set.delete(r.module)
      }
    }
  } catch { /* нет таблицы — оставляем ролевой список */ }

  return [...set]
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
        const accessible = await fetchAccessibleModules(session.roles, session.person_id)
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
