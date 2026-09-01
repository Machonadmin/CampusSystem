import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { signToken } from '@/lib/auth/jwt'
import { AUTH_CONFIG } from '@/lib/auth/config'

const ORIG_COOKIE = 'campus_imp_orig'

/**
 * POST /api/auth/impersonate — «צפייה כמשתמש».
 *
 * Только superadmin. Кладёт ТЕКУЩИЙ (админский) токен в отдельную куку
 * campus_imp_orig и подменяет сессию на сессию целевого пользователя (его
 * person_id + роли), помечая её imp_by (кто смотрит). С этого момента middleware
 * держит сессию в режиме ТОЛЬКО ЧТЕНИЕ, а баннер даёт вернуться в свой аккаунт.
 *
 * Так владелец видит систему БУКВАЛЬНО глазами сотрудника — то же меню, те же
 * права, ту же видимость «Учёбы» — без создания отдельного «предпросмотра».
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    // Уже в режиме просмотра — сначала «вернись», потом заходи заново.
    if (session.imp_by) return apiError('bad_request', 400)
    if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { person_id?: string }
    if (!body.person_id) return apiError('bad_request', 400)
    if (body.person_id === session.person_id) return apiError('bad_request', 400)

    const sb = createServerClient()
    const { data: person } = await sb.from('persons').select('id, full_name, email').eq('id', body.person_id).maybeSingle()
    if (!person) return apiError('person_not_found', 404)

    // Роли цели (как при логине).
    const { data: prRows } = await sb.from('person_roles').select('role_id').eq('person_id', body.person_id)
    const roleIds = (prRows ?? []).map(r => r.role_id)
    const roles: string[] = []
    if (roleIds.length > 0) {
      const { data: roleRows } = await sb.from('roles').select('code').in('id', roleIds)
      roleRows?.forEach(r => roles.push(r.code as string))
    }
    // Логин-имейл цели (если есть аккаунт) — только для отображения.
    const { data: acc } = await sb.from('person_accounts').select('login_email').eq('person_id', body.person_id).maybeSingle()

    const cookieStore = cookies()
    const origToken = cookieStore.get(AUTH_CONFIG.cookieName)?.value
    if (!origToken) return apiError('unauthorized', 401)

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: AUTH_CONFIG.cookieMaxAge,
      path: '/',
    }

    // Сохраняем админский токен для возврата.
    cookieStore.set(ORIG_COOKIE, origToken, cookieOpts)

    // Подменяем сессию на целевую, помеченную imp_by.
    const targetToken = await signToken({
      person_id: (person as { id: string }).id,
      login_email: (acc as { login_email: string } | null)?.login_email ?? (person as { email: string | null }).email ?? '',
      full_name: (person as { full_name: string | null }).full_name,
      roles,
      principal: 'staff',
      imp_by: session.person_id,
      imp_by_name: session.full_name,
    })
    cookieStore.set(AUTH_CONFIG.cookieName, targetToken, cookieOpts)

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
